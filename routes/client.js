const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,7)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function getExerciseProgressionClient(clientId) {
  const rows = db.prepare(`
    SELECT
      LOWER(TRIM(e.name)) as ex_key,
      e.name as ex_name,
      date(s.recorded_at) as day,
      MAX(COALESCE(s.weight, 0)) as max_weight,
      SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) as volume,
      COUNT(*) as sets_count
    FROM workout_session_sets s
    JOIN exercises e ON e.id = s.exercise_id
    JOIN workout_sessions ws ON ws.id = s.session_id
    WHERE ws.client_id = ? AND s.weight IS NOT NULL AND s.weight > 0
    GROUP BY ex_key, day ORDER BY ex_key, day
  `).all(clientId);
  const byEx = {};
  rows.forEach(r => {
    if (!byEx[r.ex_key]) byEx[r.ex_key] = { name: r.ex_name, points: [] };
    byEx[r.ex_key].points.push({ date: r.day, weight: r.max_weight, volume: r.volume, sets: r.sets_count });
  });
  const result = Object.values(byEx).filter(ex => ex.points.length >= 2);
  result.forEach(ex => {
    const first = ex.points[0].weight;
    const last = ex.points[ex.points.length - 1].weight;
    ex.delta = +(last - first).toFixed(1);
    ex.deltaPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
    ex.lastWeight = last; ex.firstWeight = first;
  });
  result.sort((a, b) => b.delta - a.delta);
  return result;
}



// Middleware: carrega client record
router.use((req, res, next) => {
  if (!req.session.user?.client_id) {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.session.user.id);
    if (!client) {
      return res.status(403).render('auth/error', { message: 'Seu cadastro ainda não foi finalizado. Fala com o Victor!', code: 403 });
    }
    req.session.user.client_id = client.id;
  }
  req.clientId = req.session.user.client_id;
  next();
});

// ============ DASHBOARD ============
router.get('/', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name, u.instagram FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.clientId);
  const activeSession = db.prepare("SELECT s.*, w.title, w.day_label FROM workout_sessions s JOIN workouts w ON w.id = s.workout_id WHERE s.client_id = ? AND s.status = 'em_andamento' ORDER BY s.started_at DESC LIMIT 1").get(req.clientId);
  const isFirstTime = !cliente.welcomed_at;
  const hasQuestionnaire = !!db.prepare("SELECT 1 FROM questionnaires WHERE client_id = ? LIMIT 1").get(req.clientId);
  const evals = db.prepare(`SELECT * FROM evaluations WHERE client_id = ? ORDER BY week_number ASC`).all(req.clientId);
  const firstEval = evals[0] || null;
  const lastEval = evals[evals.length - 1] || null;
  const workouts = db.prepare(`SELECT * FROM workouts WHERE client_id = ? AND week_number = ? ORDER BY day_label`).all(req.clientId, cliente.current_week);
  const photosCount = db.prepare(`SELECT COUNT(*) as c FROM photos WHERE client_id = ?`).get(req.clientId).c;
  const lastFeedback = db.prepare(`SELECT * FROM feedbacks WHERE client_id = ? ORDER BY week_number DESC LIMIT 1`).get(req.clientId);

  // Posição no ranking Gym Cats
  const rankList = db.prepare(`SELECT id FROM clients WHERE status IN ('ativo','implementacao') ORDER BY gym_cats_points DESC`).all();
  const position = rankList.findIndex(c => c.id === req.clientId) + 1;

  res.render('client/dashboard', {
    title: `Bem-vindo ${cliente.name} — VS TEAM`,
    cliente, evals, firstEval, lastEval, workouts, photosCount, lastFeedback, position,
    totalClients: rankList.length,
    activeSession, isFirstTime, hasQuestionnaire
  });
});

// ============ TREINOS ============
router.get('/treinos', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.clientId);
  const weekParam = parseInt(req.query.week) || cliente.current_week;
  const allWeeks = db.prepare(`SELECT DISTINCT week_number FROM workouts WHERE client_id = ? ORDER BY week_number DESC`).all(req.clientId);
  const workouts = db.prepare(`SELECT * FROM workouts WHERE client_id = ? AND week_number = ? ORDER BY day_label`).all(req.clientId, weekParam);
  const workoutsFull = workouts.map(w => ({
    ...w,
    exercises: db.prepare(`SELECT * FROM exercises WHERE workout_id = ? ORDER BY order_idx`).all(w.id).map(e => ({
      ...e,
      checked_today: !!db.prepare(`SELECT 1 FROM exercise_checks WHERE exercise_id = ? AND client_id = ? AND date(checked_at) = date('now')`).get(e.id, req.clientId)
    }))
  }));
  const diet = db.prepare(`SELECT * FROM diets WHERE client_id = ? AND week_number = ? ORDER BY created_at DESC LIMIT 1`).get(req.clientId, weekParam);

  res.render('client/treinos', { title: 'Meus Treinos — VS TEAM', cliente, weekParam, allWeeks, workoutsFull, diet });
});

router.post('/exercicios/:id/check', (req, res) => {
  const exId = req.params.id;
  const already = db.prepare(`SELECT 1 FROM exercise_checks WHERE exercise_id = ? AND client_id = ? AND date(checked_at) = date('now')`).get(exId, req.clientId);
  if (already) {
    db.prepare(`DELETE FROM exercise_checks WHERE exercise_id = ? AND client_id = ? AND date(checked_at) = date('now')`).run(exId, req.clientId);
  } else {
    db.prepare(`INSERT INTO exercise_checks (exercise_id, client_id) VALUES (?, ?)`).run(exId, req.clientId);
    // +2 pontos gym cats
    db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, 'Check-in de exercício', 2)`).run(req.clientId);
    db.prepare(`UPDATE clients SET gym_cats_points = gym_cats_points + 2 WHERE id = ?`).run(req.clientId);
  }
  res.redirect(req.get('Referrer') || '/cliente/treinos');
});

// ============ FOTOS / ANTES E DEPOIS ============
router.get('/fotos', (req, res) => {
  const photos = db.prepare(`SELECT * FROM photos WHERE client_id = ? ORDER BY taken_at DESC`).all(req.clientId);
  const antes = photos.filter(p => p.category === 'antes');
  const depois = photos.filter(p => p.category === 'depois');
  const semanais = photos.filter(p => p.category === 'semanal');
  res.render('client/fotos', { title: 'Fotos — VS TEAM', antes, depois, semanais });
});

router.post('/fotos', upload.single('photo'), (req, res) => {
  if (!req.file) { req.flash('error', 'Selecione uma foto.'); return res.redirect('/cliente/fotos'); }
  const { category, week_number, caption } = req.body;
  db.prepare(`INSERT INTO photos (client_id, category, filename, week_number, caption) VALUES (?, ?, ?, ?, ?)`)
    .run(req.clientId, category || 'semanal', req.file.filename, week_number || null, caption || null);
  // +30 pontos
  db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, 'Foto semanal enviada', 30)`).run(req.clientId);
  db.prepare(`UPDATE clients SET gym_cats_points = gym_cats_points + 30 WHERE id = ?`).run(req.clientId);
  req.flash('success', '📸 Foto enviada! +30 pontos Gym Cats!');
  res.redirect('/cliente/fotos');
});

router.get('/antes-depois', (req, res) => {
  // Cliente só vê UMA foto antes (a mais antiga marcada) e UMA depois (a mais recente marcada)
  const antes = db.prepare(`SELECT * FROM photos WHERE client_id = ? AND category = 'antes' ORDER BY taken_at ASC LIMIT 1`).get(req.clientId);
  const depois = db.prepare(`SELECT * FROM photos WHERE client_id = ? AND category = 'depois' ORDER BY taken_at DESC LIMIT 1`).get(req.clientId);
  const evals = db.prepare(`SELECT * FROM evaluations WHERE client_id = ? ORDER BY week_number ASC`).all(req.clientId);
  const cliente = db.prepare(`SELECT c.*, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.clientId);
  res.render('client/antes-depois', { title: 'Antes x Depois — VS TEAM', antes, depois, evals, cliente });
});

// ============ AVALIAÇÃO SEMANAL ============
router.get('/avaliacao', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.clientId);
  const evals = db.prepare(`SELECT * FROM evaluations WHERE client_id = ? ORDER BY week_number DESC`).all(req.clientId);
  res.render('client/avaliacao', { title: 'Ficha de Avaliação — VS TEAM', cliente, evals });
});

router.post('/avaliacao', upload.array('photos', 4), (req, res) => {
  const { week_number, weight, chest, waist, hip, arm, leg, notes } = req.body;
  const week = parseInt(week_number) || 1;
  db.prepare(`INSERT INTO evaluations (client_id, week_number, weight, chest, waist, hip, arm, leg, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.clientId, week, weight || null, chest || null, waist || null, hip || null, arm || null, leg || null, notes);
  db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, 'Ficha de avaliação enviada', 40)`).run(req.clientId);
  db.prepare(`UPDATE clients SET gym_cats_points = gym_cats_points + 40 WHERE id = ?`).run(req.clientId);

  const files = req.files || [];
  let photoCount = 0;
  files.forEach(f => {
    db.prepare(`INSERT INTO photos (client_id, category, filename, week_number, caption) VALUES (?, 'semanal', ?, ?, ?)`)
      .run(req.clientId, f.filename, week, 'Anexo ficha S' + week);
    photoCount++;
  });
  if (photoCount > 0) {
    const pts = 30 * photoCount;
    db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, ?, ?)`)
      .run(req.clientId, photoCount + ' foto(s) anexadas com a ficha', pts);
    db.prepare(`UPDATE clients SET gym_cats_points = gym_cats_points + ? WHERE id = ?`).run(pts, req.clientId);
  }
  const totalPts = 40 + (photoCount * 30);
  req.flash('success', 'Ficha S' + week + ' enviada' + (photoCount > 0 ? ' com ' + photoCount + ' foto(s)' : '') + '. +' + totalPts + ' pts Gym Cats!');
  res.redirect('/cliente/avaliacao');
});

// ============ QUESTIONÁRIO INICIAL ============
router.get('/questionario', (req, res) => {
  const template = db.prepare("SELECT * FROM questionnaire_template WHERE active = 1 ORDER BY order_idx ASC, id ASC").all();
  const existing = db.prepare(`SELECT * FROM questionnaires WHERE client_id = ? ORDER BY submitted_at DESC LIMIT 1`).get(req.clientId);
  let answers = {};
  if (existing && existing.answers_json) {
    try { answers = JSON.parse(existing.answers_json) || {}; } catch(_) {}
  }
  res.render('client/questionario', { title: 'Questionário Inicial — VS TEAM', template, existing, answers });
});

router.post('/questionario', (req, res) => {
  const template = db.prepare("SELECT q_key, label FROM questionnaire_template WHERE active = 1 ORDER BY order_idx").all();
  const answers = {};
  template.forEach(q => { answers[q.q_key] = (req.body[q.q_key] || '').trim(); });

  // Mapeia campos clássicos pra preencher tb a estrutura antiga
  const goal = answers.objetivo || null;
  const weight = parseFloat(answers.peso_atual) || null;
  const height = parseFloat(answers.altura_cm) || null;
  const age = parseInt(answers.idade) || null;
  const food_preferences = answers.alimento_favorito || null;
  const food_restrictions = answers.alimento_aversao || null;
  const medical_history = [answers.lesoes_cirurgias, answers.condicoes_medicas, answers.medicamentos].filter(Boolean).join(' | ') || null;
  const experience = answers.nivel_atividade_fisica || null;
  const training_location = null;
  const available_days = null;
  const notes = answers.dificuldades || null;

  db.prepare(`INSERT INTO questionnaires (client_id, goal, experience, weight, height, age, medical_history, food_preferences, food_restrictions, available_days, training_location, notes, answers_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.clientId, goal, experience, weight, height, age, medical_history, food_preferences, food_restrictions, available_days, training_location, notes, JSON.stringify(answers));

  db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, 'Questionário preenchido', 50)`).run(req.clientId);
  db.prepare(`UPDATE clients SET gym_cats_points = gym_cats_points + 50, implementation_step = MAX(implementation_step, 1) WHERE id = ?`).run(req.clientId);
  req.flash('success', 'Questionário enviado! +50 pts Gym Cats.');
  res.redirect('/cliente');
});

// ============ GYM CATS (RANKING) ============
router.get('/gym-cats', (req, res) => {
  const ranking = db.prepare(`
    SELECT c.id, c.gym_cats_points, u.name, u.instagram, c.current_week
    FROM clients c JOIN users u ON u.id = c.user_id
    WHERE c.status IN ('ativo','implementacao')
    ORDER BY c.gym_cats_points DESC
  `).all();
  const myEvents = db.prepare(`SELECT * FROM gym_cats_events WHERE client_id = ? ORDER BY earned_at DESC LIMIT 20`).all(req.clientId);
  const minhaPosicao = ranking.findIndex(c => c.id === req.clientId) + 1;
  res.render('client/gym-cats', { title: 'Gym Cats — VS TEAM', ranking, myEvents, minhaPosicao, meuId: req.clientId });
});

// ============ FEEDBACKS ============
router.get('/feedbacks', (req, res) => {
  const feedbacks = db.prepare(`SELECT * FROM feedbacks WHERE client_id = ? ORDER BY week_number DESC`).all(req.clientId);
  res.render('client/feedbacks', { title: 'Feedbacks — VS TEAM', feedbacks });
});

// ============ PERFIL ============
router.get('/perfil', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name, u.email, u.phone, u.instagram FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.clientId);
  res.render('client/perfil', { title: 'Meu Perfil — VS TEAM', cliente });
});

router.post('/perfil', (req, res) => {
  const { name, phone, instagram } = req.body;
  db.prepare(`UPDATE users SET name=?, phone=?, instagram=? WHERE id = ?`).run(name, phone, instagram, req.session.user.id);
  req.session.user.name = name;
  req.flash('success', 'Perfil atualizado.');
  res.redirect('/cliente/perfil');
});


// ============ SESSÃO DE TREINO ============
function getActiveSession(clientId) {
  return db.prepare("SELECT * FROM workout_sessions WHERE client_id = ? AND status = 'em_andamento' ORDER BY started_at DESC LIMIT 1").get(clientId);
}

router.get('/treino/:workoutId/iniciar', (req, res) => {
  const wId = req.params.workoutId;
  const w = db.prepare('SELECT * FROM workouts WHERE id = ? AND client_id = ?').get(wId, req.clientId);
  if (!w) return res.redirect('/cliente/treinos');
  // Se já tem uma sessão ativa, redireciona
  let session = getActiveSession(req.clientId);
  if (!session) {
    const id = db.prepare("INSERT INTO workout_sessions (client_id, workout_id) VALUES (?, ?)").run(req.clientId, wId).lastInsertRowid;
    session = { id };
  }
  res.redirect(`/cliente/treino/sessao/${session.id}/exercicio/0`);
});

router.get('/treino/sessao/:sid/exercicio/:idx', (req, res) => {
  const s = db.prepare("SELECT s.*, w.title, w.day_label FROM workout_sessions s JOIN workouts w ON w.id = s.workout_id WHERE s.id = ? AND s.client_id = ?").get(req.params.sid, req.clientId);
  if (!s) return res.redirect('/cliente/treinos');
  if (s.status !== 'em_andamento') return res.redirect(`/cliente/treino/sessao/${s.id}/concluido`);
  const exs = db.prepare("SELECT * FROM exercises WHERE workout_id = ? ORDER BY order_idx").all(s.workout_id);
  if (exs.length === 0) return res.redirect('/cliente/treinos');
  const idx = Math.max(0, Math.min(parseInt(req.params.idx) || 0, exs.length - 1));
  const ex = exs[idx];
  const sets = db.prepare("SELECT * FROM workout_session_sets WHERE session_id = ? AND exercise_id = ? ORDER BY set_number").all(s.id, ex.id);
  const cliente = db.prepare("SELECT allow_screenshot FROM clients WHERE id = ?").get(req.clientId);
  res.render('client/treino-sessao', {
    title: ex.name + ' — VS TEAM',
    session: s, exercise: ex, exercises: exs, idx, sets,
    allowScreenshot: !!(cliente && cliente.allow_screenshot)
  });
});

// Salvar peso/reps de uma série
router.post('/treino/sessao/:sid/serie', (req, res) => {
  const s = db.prepare("SELECT id FROM workout_sessions WHERE id = ? AND client_id = ? AND status = 'em_andamento'").get(req.params.sid, req.clientId);
  if (!s) return res.json({ ok: false });
  const { exercise_id, set_number, weight, reps } = req.body;
  const existing = db.prepare("SELECT id FROM workout_session_sets WHERE session_id = ? AND exercise_id = ? AND set_number = ?").get(s.id, exercise_id, set_number);
  if (existing) {
    db.prepare("UPDATE workout_session_sets SET weight = ?, reps = ? WHERE id = ?").run(weight || null, reps || null, existing.id);
  } else {
    db.prepare("INSERT INTO workout_session_sets (session_id, exercise_id, set_number, weight, reps) VALUES (?, ?, ?, ?, ?)").run(s.id, exercise_id, parseInt(set_number) || 1, weight || null, reps || null);
  }
  res.json({ ok: true });
});

// Cancelar
router.post('/treino/sessao/:sid/cancelar', (req, res) => {
  db.prepare("UPDATE workout_sessions SET status = 'cancelado', finished_at = datetime('now') WHERE id = ? AND client_id = ?").run(req.params.sid, req.clientId);
  req.flash('success', 'Treino cancelado.');
  res.redirect('/cliente/treinos');
});

// Finalizar
router.post('/treino/sessao/:sid/finalizar', (req, res) => {
  const s = db.prepare("SELECT id, started_at FROM workout_sessions WHERE id = ? AND client_id = ? AND status = 'em_andamento'").get(req.params.sid, req.clientId);
  if (!s) return res.redirect('/cliente/treinos');
  const dur = Math.max(0, Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000));
  db.prepare("UPDATE workout_sessions SET status = 'concluido', finished_at = datetime('now'), duration_sec = ? WHERE id = ?").run(dur, s.id);
  // Pontos por treino concluído
  db.prepare("INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, 'Treino concluído', 25)").run(req.clientId);
  db.prepare("UPDATE clients SET gym_cats_points = gym_cats_points + 25 WHERE id = ?").run(req.clientId);
  res.redirect(`/cliente/treino/sessao/${s.id}/concluido`);
});

router.get('/treino/sessao/:sid/concluido', (req, res) => {
  const s = db.prepare("SELECT s.*, w.title, w.day_label FROM workout_sessions s JOIN workouts w ON w.id = s.workout_id WHERE s.id = ? AND s.client_id = ?").get(req.params.sid, req.clientId);
  if (!s) return res.redirect('/cliente/treinos');
  // Estatísticas
  const stats = db.prepare("SELECT COALESCE(SUM(weight * reps), 0) AS volume, COALESCE(SUM(reps), 0) AS reps_total, COUNT(*) AS series FROM workout_session_sets WHERE session_id = ?").get(s.id);
  res.render('client/treino-concluido', { title: 'Treino concluído — VS TEAM', session: s, stats });
});

// Marca o popup de boas-vindas como visto (chamado via fetch)
router.post('/welcomed', (req, res) => {
  db.prepare("UPDATE clients SET welcomed_at = datetime('now') WHERE id = ? AND welcomed_at IS NULL").run(req.clientId);
  res.json({ ok: true });
});


// ============ PROGRESSÃO DE CARGA (cliente) ============
router.get('/progressao', (req, res) => {
  const progression = getExerciseProgressionClient(req.clientId);
  res.render('client/progressao', { title: 'Minha Progressão — VS TEAM', progression });
});

module.exports = router;
