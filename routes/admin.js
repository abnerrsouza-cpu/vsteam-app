const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const router = express.Router();

// Multer para uploads
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

// Helper: agrega progressão de carga por exercício (a partir de workout_session_sets)
function getExerciseProgression(db, clientId) {
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
    WHERE ws.client_id = ?
      AND s.weight IS NOT NULL AND s.weight > 0
    GROUP BY ex_key, day
    ORDER BY ex_key, day
  `).all(clientId);

  const byEx = {};
  rows.forEach(r => {
    if (!byEx[r.ex_key]) byEx[r.ex_key] = { name: r.ex_name, points: [] };
    byEx[r.ex_key].points.push({ date: r.day, weight: r.max_weight, volume: r.volume, sets: r.sets_count });
  });

  // Filtra exercícios com pelo menos 2 pontos
  const result = Object.values(byEx).filter(ex => ex.points.length >= 2);
  // Calcula delta total
  result.forEach(ex => {
    const first = ex.points[0].weight;
    const last = ex.points[ex.points.length - 1].weight;
    ex.delta = +(last - first).toFixed(1);
    ex.deltaPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
    ex.lastWeight = last;
    ex.firstWeight = first;
  });
  // Ordena pelo maior progresso
  result.sort((a, b) => b.delta - a.delta);
  return result;
}



// ====== SEMANA OPERACIONAL GLOBAL ======
function getOperationalWeek() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'operational_week'").get();
  return row ? parseInt(row.value) || 1 : 1;
}
function setOperationalWeek(n) {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'operational_week'").run(String(n));
}

function getCycleStartDate() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'cycle_start_date'").get();
  if (row && row.value) return new Date(row.value + 'T00:00:00');
  // fallback: segunda-feira desta semana
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0,0,0,0);
  return d;
}

function setCycleStartDate(dateStr) {
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('cycle_start_date', ?)`).run(dateStr);
}

// ====== VIGÊNCIA / VENCIMENTOS ======
function daysBetween(d1, d2) {
  const ms = new Date(d2).getTime() - new Date(d1).getTime();
  return Math.round(ms / (1000*60*60*24));
}

function expirationStatus(end_date) {
  if (!end_date) return { label: 'Sem vigência', days: null, badge: 'outline', color: 'muted' };
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(end_date + 'T00:00:00');
  const days = daysBetween(today, end);
  if (days < 0) return { label: 'Vencido há ' + Math.abs(days) + 'd', days, badge: 'danger', color: 'danger' };
  if (days === 0) return { label: 'Vence hoje', days, badge: 'warning', color: 'warning' };
  if (days <= 7) return { label: 'Vence em ' + days + 'd', days, badge: 'warning', color: 'warning' };
  if (days <= 30) return { label: days + ' dias restantes', days, badge: 'info', color: 'info' };
  return { label: days + ' dias restantes', days, badge: 'success', color: 'success' };
}

// Retorna {start, end, label} da semana N (N = 1, 2, ...)
function getWeekRange(weekNumber) {
  const start = getCycleStartDate();
  start.setDate(start.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  return {
    start: start.toISOString().slice(0,10),
    end: end.toISOString().slice(0,10),
    label: fmt(start) + ' a ' + fmt(end)
  };
}

// Injeta semana em todas as views do admin
router.use((req, res, next) => {
  res.locals.operationalWeek = getOperationalWeek();
  res.locals.weekRange = getWeekRange(res.locals.operationalWeek);
  next();
});

// Avançar semana: cria lembretes pros ativos, avança current_week
router.post('/semana/avancar', (req, res) => {
  const current = getOperationalWeek();
  const next = current + 1;
  setOperationalWeek(next);

  // Avança a semana interna de cada cliente ativo
  db.prepare("UPDATE clients SET current_week = current_week + 1 WHERE status = 'ativo'").run();

  // Cria lembretes de relatório da nova semana
  const ativos = db.prepare(`SELECT c.id, c.current_week, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.status = 'ativo'`).all();
  const today = new Date().toISOString().slice(0,10);
  const stmt = db.prepare(`INSERT INTO reminders (client_id, type, scheduled_for, message, status) VALUES (?, 'relatorio_semanal', ?, ?, 'pendente')`);
  ativos.forEach(c => {
    stmt.run(c.id, today, `Fala ${c.name}! VS TEAM — semana ${c.current_week}. Manda fotos e ficha até sábado pro teu relatório 💪🔥`);
  });

  req.flash('success', `🚀 Semana operacional agora é ${next}. ${ativos.length} lembretes criados.`);
  res.redirect(req.get('Referrer') || '/admin');
});

// Voltar semana (reverte)
router.post('/semana/voltar', (req, res) => {
  const current = getOperationalWeek();
  if (current <= 1) {
    req.flash('error', 'Já está na semana 1. Não dá pra voltar.');
    return res.redirect(req.get('Referrer') || '/admin');
  }
  const prev = current - 1;
  setOperationalWeek(prev);
  db.prepare("UPDATE clients SET current_week = MAX(1, current_week - 1) WHERE status = 'ativo'").run();
  req.flash('success', `↩ Voltou para semana ${prev}.`);
  res.redirect(req.get('Referrer') || '/admin');
});

// Setar a data de início do ciclo (calibrar "semana 1")
router.post('/semana/start-date', (req, res) => {
  const { date } = req.body;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    setCycleStartDate(date);
    req.flash('success', 'Data de início do ciclo atualizada.');
  } else {
    req.flash('error', 'Data inválida.');
  }
  res.redirect(req.get('Referrer') || '/admin/gestao');
});

// Setar diretamente uma semana (sem criar lembretes ou mexer em clientes)
router.post('/semana/set', (req, res) => {
  const n = parseInt(req.body.week) || 1;
  setOperationalWeek(Math.max(1, n));
  req.flash('success', `Semana operacional definida em ${n}.`);
  res.redirect(req.get('Referrer') || '/admin');
});

// ============ DASHBOARD ============
router.get('/', (req, res) => {
  const stats = {
    leads_total: db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage NOT IN ('convertido','perdido')").get().c,
    leads_captacao: db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage = 'captacao'").get().c,
    leads_vendas: db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage IN ('conversa','vendas','negociacao')").get().c,
    leads_contrato: db.prepare("SELECT COUNT(*) as c FROM leads WHERE stage = 'contrato'").get().c,
    clientes_implementacao: db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'implementacao'").get().c,
    clientes_ativos: db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'ativo'").get().c,
    clientes_total: db.prepare("SELECT COUNT(*) as c FROM clients").get().c,
    receita_mes: db.prepare("SELECT COALESCE(SUM(value), 0) as s FROM clients WHERE status IN ('ativo','implementacao')").get().s
  };

  // Vencimentos
  const venc = {
    hoje: db.prepare(`SELECT COUNT(*) c FROM clients WHERE end_date = date('now') AND status IN ('ativo','implementacao')`).get().c,
    sete_dias: db.prepare(`SELECT COUNT(*) c FROM clients WHERE date(end_date) BETWEEN date('now') AND date('now','+7 days') AND status IN ('ativo','implementacao')`).get().c,
    vencidos: db.prepare(`SELECT COUNT(*) c FROM clients WHERE date(end_date) < date('now') AND status IN ('ativo','implementacao')`).get().c,
    sem_vigencia: db.prepare(`SELECT COUNT(*) c FROM clients WHERE end_date IS NULL AND status IN ('ativo','implementacao')`).get().c
  };

  // Aniversariantes do dia (precisa de date_of_birth — opcional)
  const aniversariantes = [];

  // Próximos a vencer (top 5)
  const proximosVenc = db.prepare(`
    SELECT c.id, c.end_date, u.name FROM clients c JOIN users u ON u.id = c.user_id
    WHERE c.end_date IS NOT NULL AND c.status IN ('ativo','implementacao')
      AND date(c.end_date) >= date('now') AND date(c.end_date) <= date('now','+14 days')
    ORDER BY c.end_date ASC LIMIT 5
  `).all().map(c => ({ ...c, exp: expirationStatus(c.end_date) }));

  const leadsRecentes = db.prepare(`
    SELECT * FROM leads
    WHERE stage NOT IN ('convertido','perdido')
    ORDER BY created_at DESC LIMIT 5
  `).all();

  const clientesAtencao = db.prepare(`
    SELECT c.*, u.name, u.phone FROM clients c
    JOIN users u ON u.id = c.user_id
    WHERE c.status IN ('ativo','implementacao')
    ORDER BY c.current_week DESC LIMIT 6
  `).all();

  res.render('admin/dashboard', {
    title: 'Dashboard — VS TEAM',
    stats, leadsRecentes, clientesAtencao, venc, proximosVenc
  });
});

// ============ CRM — CAPTAÇÃO ============
router.get('/captacao', (req, res) => {
  const leads = db.prepare(`SELECT * FROM leads WHERE stage = 'captacao' ORDER BY created_at DESC`).all();
  res.render('admin/captacao', { title: 'Captação — VS TEAM', leads });
});

router.post('/captacao', (req, res) => {
  const { name, phone, instagram, source, referred_by, notes } = req.body;
  db.prepare(`INSERT INTO leads (name, phone, instagram, source, referred_by, notes, stage) VALUES (?, ?, ?, ?, ?, ?, 'captacao')`)
    .run(name, phone || null, instagram || null, source || 'outro', referred_by || null, notes || null);
  req.flash('success', 'Lead cadastrado na captação!');
  res.redirect('/admin/captacao');
});

// Avançar lead para próximo estágio
router.post('/leads/:id/stage', (req, res) => {
  const { id } = req.params;
  const { stage, notes } = req.body;
  db.prepare(`UPDATE leads SET stage = ?, notes = COALESCE(?, notes) WHERE id = ?`)
    .run(stage, notes || null, id);
  req.flash('success', `Lead movido para: ${stage.toUpperCase()}`);
  res.redirect(req.get('Referrer') || '/admin/vendas');
});

// ============ VENDAS ============
router.get('/vendas', (req, res) => {
  const stages = db.prepare('SELECT * FROM pipeline_stages ORDER BY order_idx').all();
  const pipeline = {};
  const totals = {};
  const counts = {};
  stages.forEach(s => {
    pipeline[s.stage_key] = db.prepare(`SELECT * FROM leads WHERE stage = ? ORDER BY created_at DESC`).all(s.stage_key);
    totals[s.stage_key] = pipeline[s.stage_key].reduce((sum, l) => sum + (Number(l.value) || 0), 0);
    counts[s.stage_key] = pipeline[s.stage_key].length;
  });
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  res.render('admin/vendas', { title: 'Vendas — VS TEAM', stages, pipeline, totals, counts, grandTotal });
});

// Editar nomes/descrições das colunas
router.post('/vendas/colunas', (req, res) => {
  const { names = {}, descriptions = {} } = req.body;
  const upd = db.prepare('UPDATE pipeline_stages SET display_name = ?, description = ? WHERE stage_key = ?');
  Object.keys(names).forEach(k => {
    upd.run(names[k] || k, descriptions[k] || null, k);
  });
  req.flash('success', 'Colunas atualizadas!');
  res.redirect('/admin/vendas');
});

router.get('/leads/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.redirect('/admin/vendas');
  res.render('admin/lead-detail', { title: `Lead: ${lead.name}`, lead });
});

router.post('/leads/:id/update', (req, res) => {
  const { name, phone, instagram, plan, plan_duration, value, notes } = req.body;
  db.prepare(`UPDATE leads SET name=?, phone=?, instagram=?, plan=?, plan_duration=?, value=?, notes=? WHERE id = ?`)
    .run(name, phone, instagram, plan, plan_duration, value || null, notes, req.params.id);
  req.flash('success', 'Lead atualizado.');
  res.redirect(`/admin/leads/${req.params.id}`);
});

// Converter lead em cliente (fecha contrato)
router.post('/leads/:id/converter', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.redirect('/admin/vendas');

  const { email, password, start_date } = req.body;
  if (!email || !password) {
    req.flash('error', 'Email e senha temporária do cliente são obrigatórios.');
    return res.redirect(`/admin/leads/${req.params.id}`);
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const userId = db.prepare(`INSERT INTO users (name, email, password_hash, role, phone, instagram) VALUES (?, ?, ?, 'client', ?, ?)`)
      .run(lead.name, email.toLowerCase().trim(), hash, lead.phone, lead.instagram).lastInsertRowid;

    const clientId = db.prepare(`INSERT INTO clients (user_id, lead_id, plan, plan_duration, value, start_date, status, implementation_step, current_week)
      VALUES (?, ?, ?, ?, ?, ?, 'implementacao', 0, 1)`)
      .run(userId, lead.id, lead.plan, lead.plan_duration, lead.value, start_date || new Date().toISOString().slice(0,10)).lastInsertRowid;

    db.prepare(`UPDATE leads SET stage = 'convertido', converted_at = datetime('now'), converted_client_id = ? WHERE id = ?`)
      .run(clientId, lead.id);

    req.flash('success', `🎉 Lead convertido! ${lead.name} agora é cliente. Implementação iniciada.`);
    res.redirect(`/admin/clientes/${clientId}`);
  } catch (e) {
    req.flash('error', 'Erro ao converter: ' + e.message);
    res.redirect(`/admin/leads/${req.params.id}`);
  }
});

router.post('/leads/:id/perder', (req, res) => {
  db.prepare(`UPDATE leads SET stage = 'perdido', notes = COALESCE(?, notes) WHERE id = ?`).run(req.body.notes || null, req.params.id);
  req.flash('success', 'Lead marcado como perdido.');
  res.redirect('/admin/vendas');
});

// ============ IMPLEMENTAÇÃO ============
router.get('/implementacao', (req, res) => {
  const clientes = db.prepare(`
    SELECT c.*, u.name, u.email, u.phone, u.instagram,
      (SELECT COUNT(*) FROM questionnaires WHERE client_id = c.id) as has_questionnaire,
      (SELECT COUNT(*) FROM photos WHERE client_id = c.id AND category IN ('antes','semanal')) as photos_count,
      (SELECT COUNT(*) FROM workouts WHERE client_id = c.id) as has_workout
    FROM clients c JOIN users u ON u.id = c.user_id
    WHERE c.status = 'implementacao'
    ORDER BY c.created_at DESC
  `).all();
  res.render('admin/implementacao', { title: 'Implementação — VS TEAM', clientes });
});

router.post('/clientes/:id/implementation-step', (req, res) => {
  const { step, finalize } = req.body;
  if (finalize === '1') {
    db.prepare(`UPDATE clients SET status = 'ativo', implementation_step = 3 WHERE id = ?`).run(req.params.id);
    req.flash('success', 'Cliente movido para gestão contínua! 🚀');
  } else {
    db.prepare(`UPDATE clients SET implementation_step = ? WHERE id = ?`).run(parseInt(step) || 0, req.params.id);
    req.flash('success', 'Etapa atualizada.');
  }
  res.redirect(`/admin/clientes/${req.params.id}`);
});

// ============ GESTÃO CONTÍNUA ============
router.get('/gestao', (req, res) => {
  const week = getOperationalWeek();
  const clientes = db.prepare(`
    SELECT c.*, u.name, u.email, u.phone,
      (SELECT MAX(submitted_at) FROM evaluations WHERE client_id = c.id) as last_eval,
      (SELECT MAX(taken_at) FROM photos WHERE client_id = c.id AND category = 'semanal') as last_photo,
      (SELECT COUNT(*) FROM evaluations WHERE client_id = c.id AND week_number = ?) as eval_this_week,
      (SELECT COUNT(*) FROM photos WHERE client_id = c.id AND category = 'semanal' AND week_number = ?) as photo_this_week,
      (SELECT COUNT(*) FROM feedbacks WHERE client_id = c.id AND week_number = ?) as feedback_this_week
    FROM clients c JOIN users u ON u.id = c.user_id
    WHERE c.status = 'ativo'
    ORDER BY c.current_week DESC
  `).all(week, week, week);
  const range = getWeekRange(week);
  const prevRange = week > 1 ? getWeekRange(week - 1) : null;
  const nextRange = getWeekRange(week + 1);
  res.render('admin/gestao', { title: 'Gestão Contínua — VS TEAM', clientes, week, range, prevRange, nextRange });
});

// ============ CLIENTES ============
router.get('/clientes', (req, res) => {
  const clientes = db.prepare(`
    SELECT c.*, u.name, u.email, u.phone, u.instagram
    FROM clients c JOIN users u ON u.id = c.user_id
    ORDER BY u.name ASC
  `).all();
  res.render('admin/clientes', { title: 'Clientes — VS TEAM', clientes });
});

router.get('/clientes/novo', (req, res) => {
  res.render('admin/cliente-novo', { title: 'Novo Cliente — VS TEAM' });
});

router.post('/clientes/novo', (req, res) => {
  const { name, email, password, phone, instagram, plan, plan_duration, value, start_date } = req.body;
  try {
    const hash = bcrypt.hashSync(password || 'cliente123', 10);
    const userId = db.prepare(`INSERT INTO users (name, email, password_hash, role, phone, instagram) VALUES (?, ?, ?, 'client', ?, ?)`)
      .run(name, email.toLowerCase().trim(), hash, phone || null, instagram || null).lastInsertRowid;

    const clientId = db.prepare(`INSERT INTO clients (user_id, plan, plan_duration, value, start_date, status) VALUES (?, ?, ?, ?, ?, 'implementacao')`)
      .run(userId, plan, plan_duration, value || null, start_date || new Date().toISOString().slice(0,10)).lastInsertRowid;

    req.flash('success', 'Cliente criado! Redirecionando para perfil.');
    res.redirect(`/admin/clientes/${clientId}`);
  } catch (e) {
    req.flash('error', 'Erro ao criar: ' + e.message);
    res.redirect('/admin/clientes/novo');
  }
});

router.get('/clientes/:id', (req, res) => {
  const cliente = db.prepare(`
    SELECT c.*, u.name, u.email, u.phone, u.instagram
    FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(req.params.id);
  if (!cliente) return res.redirect('/admin/clientes');

  const questionnaire = db.prepare(`SELECT * FROM questionnaires WHERE client_id = ? ORDER BY submitted_at DESC LIMIT 1`).get(cliente.id);
  const photos = db.prepare(`SELECT * FROM photos WHERE client_id = ? ORDER BY taken_at DESC`).all(cliente.id);
  const workoutsRaw = db.prepare(`SELECT * FROM workouts WHERE client_id = ? ORDER BY week_number DESC, day_label ASC`).all(cliente.id);
  const workouts = workoutsRaw.map(w => Object.assign({}, w, { exercises: db.prepare(`SELECT * FROM exercises WHERE workout_id = ? ORDER BY order_idx`).all(w.id) }));
  const diets = db.prepare(`SELECT * FROM diets WHERE client_id = ? ORDER BY week_number DESC`).all(cliente.id);
  const evals = db.prepare(`SELECT * FROM evaluations WHERE client_id = ? ORDER BY week_number ASC`).all(cliente.id);
  const feedbacks = db.prepare(`SELECT * FROM feedbacks WHERE client_id = ? ORDER BY week_number DESC`).all(cliente.id);

  // Templates disponíveis pra "Aplicar template"
  const treinoTpls = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM workout_template_exercises WHERE template_id = t.id) as ex_count
    FROM workout_templates t ORDER BY t.name ASC
  `).all();
  const dietaTpls = db.prepare(`SELECT * FROM diet_templates ORDER BY name ASC`).all();

  res.render('admin/cliente-detalhe', {
    title: `${cliente.name} — VS TEAM`,
    cliente, questionnaire, photos, workouts, diets, evals, feedbacks,
    treinoTpls, dietaTpls
  });
});

// Atualiza informações do cliente
router.post('/clientes/:id/update', (req, res) => {
  const { name, phone, instagram, plan, plan_duration, value, status, current_week } = req.body;
  const cliente = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(req.params.id);
  if (!cliente) return res.redirect('/admin/clientes');
  db.prepare(`UPDATE users SET name=?, phone=?, instagram=? WHERE id = ?`).run(name, phone, instagram, cliente.user_id);
  db.prepare(`UPDATE clients SET plan=?, plan_duration=?, value=?, status=?, current_week=? WHERE id = ?`)
    .run(plan, plan_duration, value || null, status, parseInt(current_week) || 1, req.params.id);
  req.flash('success', 'Cliente atualizado.');
  res.redirect(`/admin/clientes/${req.params.id}`);
});

// Criar treino
router.post('/clientes/:id/treinos', (req, res) => {
  const { week_number, day_label, title, focus, notes } = req.body;
  db.prepare(`INSERT INTO workouts (client_id, week_number, day_label, title, focus, notes) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, parseInt(week_number) || 1, day_label, title, focus, notes);
  req.flash('success', 'Treino adicionado.');
  res.redirect(`/admin/clientes/${req.params.id}#treinos`);
});

router.post('/treinos/:workoutId/exercicios', (req, res) => {
  const { name, sets, reps, rest, load_kg, video_url, notes, library_id, client_id } = req.body;
  const orderRow = db.prepare('SELECT MAX(order_idx) as m FROM exercises WHERE workout_id = ?').get(req.params.workoutId);
  const order = (orderRow.m ?? -1) + 1;
  db.prepare(`INSERT INTO exercises (workout_id, library_id, name, sets, reps, rest, load_kg, video_url, notes, order_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.workoutId, library_id || null, name, sets, reps, rest, load_kg, video_url, notes, order);
  req.flash('success', 'Exercício adicionado.');
  res.redirect(`/admin/clientes/${client_id}#treinos`);
});

router.post('/treinos/:workoutId/delete', (req, res) => {
  const { client_id } = req.body;
  db.prepare('DELETE FROM workouts WHERE id = ?').run(req.params.workoutId);
  req.flash('success', 'Treino removido.');
  res.redirect(`/admin/clientes/${client_id}#treinos`);
});

router.post('/exercicios/:id/delete', (req, res) => {
  const { client_id } = req.body;
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/clientes/${client_id}#treinos`);
});

// Dieta
router.post('/clientes/:id/dietas', (req, res) => {
  const { week_number, meal_plan, calories, protein, carbs, fats, notes } = req.body;
  db.prepare(`INSERT INTO diets (client_id, week_number, meal_plan, calories, protein, carbs, fats, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, parseInt(week_number) || 1, meal_plan, calories || null, protein || null, carbs || null, fats || null, notes);
  req.flash('success', 'Dieta adicionada.');
  res.redirect(`/admin/clientes/${req.params.id}#dieta`);
});

// Feedback semanal
router.post('/clientes/:id/feedback', (req, res) => {
  const { week_number, analysis, optimizations, next_steps } = req.body;
  db.prepare(`INSERT INTO feedbacks (client_id, week_number, analysis, optimizations, next_steps) VALUES (?, ?, ?, ?, ?)`)
    .run(req.params.id, parseInt(week_number) || 1, analysis, optimizations, next_steps);
  // Avança a semana
  db.prepare(`UPDATE clients SET current_week = current_week + 1 WHERE id = ?`).run(req.params.id);
  req.flash('success', '✅ Feedback enviado e nova semana iniciada!');
  res.redirect(`/admin/clientes/${req.params.id}#feedback`);
});

// Questionário (admin pode preencher pelo cliente também)
router.post('/clientes/:id/questionario', (req, res) => {
  const q = req.body;
  db.prepare(`INSERT INTO questionnaires (client_id, goal, experience, weight, height, age, medical_history, food_preferences, food_restrictions, available_days, training_location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, q.goal, q.experience, q.weight || null, q.height || null, q.age || null,
         q.medical_history, q.food_preferences, q.food_restrictions, q.available_days || null, q.training_location, q.notes);
  req.flash('success', 'Questionário salvo.');
  res.redirect(`/admin/clientes/${req.params.id}#questionario`);
});

// Upload foto pelo admin
router.post('/clientes/:id/fotos', upload.single('photo'), (req, res) => {
  if (!req.file) { req.flash('error', 'Selecione uma foto.'); return res.redirect(`/admin/clientes/${req.params.id}`); }
  const { category, week_number, caption } = req.body;
  db.prepare(`INSERT INTO photos (client_id, category, filename, week_number, caption) VALUES (?, ?, ?, ?, ?)`)
    .run(req.params.id, category || 'semanal', req.file.filename, week_number || null, caption || null);
  req.flash('success', 'Foto enviada.');
  res.redirect(`/admin/clientes/${req.params.id}#fotos`);
});

// Mudar categoria de uma foto (Antes / Depois / Semanal)
router.post('/fotos/:id/categoria', (req, res) => {
  const { category, client_id } = req.body;
  if (!['antes','depois','semanal'].includes(category)) {
    req.flash('error', 'Categoria inválida.');
    return res.redirect(req.get('Referrer') || '/admin');
  }
  db.prepare('UPDATE photos SET category = ? WHERE id = ?').run(category, req.params.id);
  req.flash('success', 'Foto marcada como ' + category.toUpperCase() + '.');
  res.redirect(`/admin/clientes/${client_id}#fotos`);
});

router.post('/fotos/:id/delete', (req, res) => {
  const { client_id } = req.body;
  const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
  if (photo) {
    const file = path.join(__dirname, '..', 'public', 'uploads', photo.filename);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  }
  res.redirect(`/admin/clientes/${client_id}#fotos`);
});

// Adicionar avaliação manualmente
router.post('/clientes/:id/avaliacao', (req, res) => {
  const { week_number, weight, chest, waist, hip, arm, leg, notes } = req.body;
  db.prepare(`INSERT INTO evaluations (client_id, week_number, weight, chest, waist, hip, arm, leg, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, parseInt(week_number) || 1, weight || null, chest || null, waist || null, hip || null, arm || null, leg || null, notes);
  req.flash('success', 'Avaliação adicionada.');
  res.redirect(`/admin/clientes/${req.params.id}#avaliacoes`);
});

// ============ BIBLIOTECA DE EXERCÍCIOS ============
router.get('/exercicios', (req, res) => {
  const items = db.prepare('SELECT * FROM exercise_library ORDER BY muscle_group, name').all();
  res.render('admin/biblioteca', { title: 'Biblioteca de Exercícios — VS TEAM', items });
});

router.post('/exercicios', (req, res) => {
  const { name, muscle_group, equipment, video_url, description } = req.body;
  db.prepare(`INSERT INTO exercise_library (name, muscle_group, equipment, video_url, description) VALUES (?, ?, ?, ?, ?)`)
    .run(name, muscle_group, equipment, video_url, description);
  req.flash('success', 'Exercício adicionado à biblioteca.');
  res.redirect('/admin/exercicios');
});

router.post('/exercicios/:id/delete', (req, res) => {
  db.prepare('DELETE FROM exercise_library WHERE id = ?').run(req.params.id);
  res.redirect('/admin/exercicios');
});

// ============ GYM CATS ============
router.get('/gym-cats', (req, res) => {
  const ranking = db.prepare(`
    SELECT c.id, c.gym_cats_points, u.name, u.instagram,
      (SELECT COUNT(*) FROM gym_cats_events WHERE client_id = c.id) as events_count
    FROM clients c JOIN users u ON u.id = c.user_id
    WHERE c.status IN ('ativo','implementacao')
    ORDER BY c.gym_cats_points DESC
  `).all();
  const events = db.prepare(`
    SELECT g.*, u.name FROM gym_cats_events g
    JOIN clients c ON c.id = g.client_id
    JOIN users u ON u.id = c.user_id
    ORDER BY g.earned_at DESC LIMIT 30
  `).all();
  res.render('admin/gym-cats', { title: 'Gym Cats — VS TEAM', ranking, events });
});

router.post('/gym-cats/pontos', (req, res) => {
  const { client_id, action, points } = req.body;
  const pts = parseInt(points) || 0;
  db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, ?, ?)`).run(client_id, action, pts);
  db.prepare(`UPDATE clients SET gym_cats_points = gym_cats_points + ? WHERE id = ?`).run(pts, client_id);
  req.flash('success', `+${pts} pontos atribuídos!`);
  res.redirect('/admin/gym-cats');
});

// ============ LEMBRETES ============
router.get('/lembretes', (req, res) => {
  const pendentes = db.prepare(`
    SELECT r.*, u.name as client_name, u.phone FROM reminders r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE r.status = 'pendente'
    ORDER BY r.scheduled_for DESC
  `).all();
  const enviados = db.prepare(`
    SELECT r.*, u.name as client_name FROM reminders r
    LEFT JOIN clients c ON c.id = r.client_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE r.status = 'enviado'
    ORDER BY r.sent_at DESC LIMIT 20
  `).all();
  const clientes = db.prepare(`SELECT c.id, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.status IN ('ativo','implementacao')`).all();
  res.render('admin/lembretes', { title: 'Lembretes — VS TEAM', pendentes, enviados, clientes });
});

router.post('/lembretes', (req, res) => {
  const { client_id, type, scheduled_for, message } = req.body;
  db.prepare(`INSERT INTO reminders (client_id, type, scheduled_for, message, status) VALUES (?, ?, ?, ?, 'pendente')`)
    .run(client_id || null, type, scheduled_for, message);
  req.flash('success', 'Lembrete agendado.');
  res.redirect('/admin/lembretes');
});

router.post('/lembretes/:id/enviar', (req, res) => {
  db.prepare(`UPDATE reminders SET status = 'enviado', sent_at = datetime('now') WHERE id = ?`).run(req.params.id);
  req.flash('success', 'Lembrete marcado como enviado.');
  res.redirect('/admin/lembretes');
});

router.post('/lembretes/disparo-semanal', (req, res) => {
  // Cria lembretes para todos os clientes ativos (disparo da quarta-feira)
  const ativos = db.prepare(`SELECT c.id, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.status = 'ativo'`).all();
  const today = new Date().toISOString().slice(0,10);
  const stmt = db.prepare(`INSERT INTO reminders (client_id, type, scheduled_for, message, status) VALUES (?, 'fotos_semanais', ?, ?, 'pendente')`);
  ativos.forEach(c => {
    stmt.run(c.id, today, `Fala ${c.name}! VS TEAM na área 💪 Manda as fotos atualizadas e a ficha de avaliação até sábado pra eu otimizar tua semana. Rumo à evolução 🔥`);
  });
  req.flash('success', `🔥 Disparo criado para ${ativos.length} clientes ativos!`);
  res.redirect('/admin/lembretes');
});

router.post('/lembretes/:id/delete', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(req.params.id);
  res.redirect('/admin/lembretes');
});


// ============ TEMPLATE DO QUESTIONÁRIO ============
router.get('/questionario-template', (req, res) => {
  const items = db.prepare("SELECT * FROM questionnaire_template ORDER BY order_idx ASC, id ASC").all();
  res.render('admin/questionario-template', { title: 'Questionário — VS TEAM', items });
});

router.post('/questionario-template', (req, res) => {
  const { label, field_type, options, required } = req.body;
  if (!label || !label.trim()) {
    req.flash('error', 'Pergunta obrigatória.');
    return res.redirect('/admin/questionario-template');
  }
  // Gera q_key estável a partir do label
  const slug = label.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  let q_key = slug || 'pergunta';
  // Garante unicidade
  let n = 1;
  while (db.prepare('SELECT 1 FROM questionnaire_template WHERE q_key = ?').get(q_key)) {
    q_key = (slug || 'pergunta') + '_' + (++n);
  }
  const max = db.prepare('SELECT COALESCE(MAX(order_idx), -1) AS m FROM questionnaire_template').get().m;
  let opts = null;
  if (field_type === 'select' && options) {
    const arr = options.split('|').map(s => s.trim()).filter(Boolean);
    opts = JSON.stringify(arr);
  }
  db.prepare("INSERT INTO questionnaire_template (q_key, label, field_type, options, required, order_idx) VALUES (?, ?, ?, ?, ?, ?)")
    .run(q_key, label.trim(), field_type || 'textarea', opts, required ? 1 : 0, max + 1);
  req.flash('success', 'Pergunta adicionada.');
  res.redirect('/admin/questionario-template');
});

router.post('/questionario-template/:id/update', (req, res) => {
  const { label, field_type, options, required, active } = req.body;
  let opts = null;
  if (field_type === 'select' && options) {
    const arr = options.split('|').map(s => s.trim()).filter(Boolean);
    opts = JSON.stringify(arr);
  }
  db.prepare("UPDATE questionnaire_template SET label=?, field_type=?, options=?, required=?, active=? WHERE id=?")
    .run(label, field_type || 'textarea', opts, required ? 1 : 0, active ? 1 : 0, req.params.id);
  req.flash('success', 'Pergunta atualizada.');
  res.redirect('/admin/questionario-template');
});

router.post('/questionario-template/:id/delete', (req, res) => {
  db.prepare("DELETE FROM questionnaire_template WHERE id = ?").run(req.params.id);
  req.flash('success', 'Pergunta removida.');
  res.redirect('/admin/questionario-template');
});

router.post('/questionario-template/:id/move', (req, res) => {
  const dir = req.body.dir === 'up' ? -1 : 1;
  const cur = db.prepare("SELECT id, order_idx FROM questionnaire_template WHERE id = ?").get(req.params.id);
  if (!cur) return res.redirect('/admin/questionario-template');
  const neighbor = db.prepare(
    dir === -1
      ? "SELECT id, order_idx FROM questionnaire_template WHERE order_idx < ? ORDER BY order_idx DESC LIMIT 1"
      : "SELECT id, order_idx FROM questionnaire_template WHERE order_idx > ? ORDER BY order_idx ASC LIMIT 1"
  ).get(cur.order_idx);
  if (neighbor) {
    db.prepare("UPDATE questionnaire_template SET order_idx = ? WHERE id = ?").run(neighbor.order_idx, cur.id);
    db.prepare("UPDATE questionnaire_template SET order_idx = ? WHERE id = ?").run(cur.order_idx, neighbor.id);
  }
  res.redirect('/admin/questionario-template');
});


// Permite/bloqueia screenshot dos treinos pelo cliente
router.post('/clientes/:id/screenshot-toggle', (req, res) => {
  const cur = db.prepare('SELECT allow_screenshot FROM clients WHERE id = ?').get(req.params.id);
  const novo = cur && cur.allow_screenshot ? 0 : 1;
  db.prepare('UPDATE clients SET allow_screenshot = ? WHERE id = ?').run(novo, req.params.id);
  req.flash('success', novo ? 'Print liberado para este cliente.' : 'Print bloqueado (watermark VS TEAM ativada).');
  res.redirect(`/admin/clientes/${req.params.id}`);
});


// ============ VENCIMENTOS ============
router.get('/vencimentos', (req, res) => {
  const filtro = req.query.filtro || 'proximos';
  const today = new Date().toISOString().slice(0,10);

  const queries = {
    proximos: `SELECT c.*, u.name, u.email, u.phone, u.instagram FROM clients c
      JOIN users u ON u.id = c.user_id
      WHERE c.end_date IS NOT NULL AND c.status IN ('ativo','implementacao')
        AND date(c.end_date) >= date('now') AND date(c.end_date) <= date('now', '+30 days')
      ORDER BY c.end_date ASC`,
    vencidos: `SELECT c.*, u.name, u.email, u.phone, u.instagram FROM clients c
      JOIN users u ON u.id = c.user_id
      WHERE c.end_date IS NOT NULL AND c.status IN ('ativo','implementacao')
        AND date(c.end_date) < date('now')
      ORDER BY c.end_date ASC`,
    sem_vigencia: `SELECT c.*, u.name, u.email, u.phone, u.instagram FROM clients c
      JOIN users u ON u.id = c.user_id
      WHERE c.end_date IS NULL AND c.status IN ('ativo','implementacao')
      ORDER BY u.name ASC`,
    todos: `SELECT c.*, u.name, u.email, u.phone, u.instagram FROM clients c
      JOIN users u ON u.id = c.user_id
      WHERE c.status IN ('ativo','implementacao')
      ORDER BY CASE WHEN c.end_date IS NULL THEN 1 ELSE 0 END, c.end_date ASC`
  };

  const clientes = db.prepare(queries[filtro] || queries.proximos).all();
  const counts = {
    proximos: db.prepare(`SELECT COUNT(*) c FROM clients WHERE end_date IS NOT NULL AND status IN ('ativo','implementacao') AND date(end_date) >= date('now') AND date(end_date) <= date('now','+30 days')`).get().c,
    vencidos: db.prepare(`SELECT COUNT(*) c FROM clients WHERE end_date IS NOT NULL AND status IN ('ativo','implementacao') AND date(end_date) < date('now')`).get().c,
    sem_vigencia: db.prepare(`SELECT COUNT(*) c FROM clients WHERE end_date IS NULL AND status IN ('ativo','implementacao')`).get().c,
    todos: db.prepare(`SELECT COUNT(*) c FROM clients WHERE status IN ('ativo','implementacao')`).get().c
  };

  const lista = clientes.map(c => ({ ...c, exp: expirationStatus(c.end_date) }));

  res.render('admin/vencimentos', {
    title: 'Vencimentos — VS TEAM',
    clientes: lista, filtro, counts
  });
});

// Renovar plano (estende end_date)
router.post('/clientes/:id/renovar', (req, res) => {
  const meses = parseInt(req.body.meses) || 1;
  const c = db.prepare('SELECT end_date FROM clients WHERE id = ?').get(req.params.id);
  if (!c) return res.redirect('/admin/clientes');

  let base;
  if (c.end_date && new Date(c.end_date + 'T00:00:00') > new Date()) {
    base = new Date(c.end_date + 'T00:00:00');
  } else {
    base = new Date(); base.setHours(0,0,0,0);
  }
  base.setMonth(base.getMonth() + meses);
  const novo = base.toISOString().slice(0,10);

  db.prepare("UPDATE clients SET end_date = ?, status = CASE WHEN status = 'encerrado' THEN 'ativo' ELSE status END WHERE id = ?").run(novo, req.params.id);
  req.flash('success', `Plano renovado por ${meses} mês(es). Novo vencimento: ${novo.split('-').reverse().join('/')}`);
  res.redirect(req.get('Referrer') || `/admin/clientes/${req.params.id}`);
});

// Definir/atualizar vigência manualmente
router.post('/clientes/:id/vigencia', (req, res) => {
  const { end_date } = req.body;
  db.prepare("UPDATE clients SET end_date = ? WHERE id = ?").run(end_date || null, req.params.id);
  req.flash('success', end_date ? 'Vigência atualizada.' : 'Vigência removida.');
  res.redirect(req.get('Referrer') || `/admin/clientes/${req.params.id}`);
});


// ============ CONVITES ============
const crypto = require('crypto');
function genToken() { return crypto.randomBytes(16).toString('hex'); }

router.get('/convites', (req, res) => {
  const ativos = db.prepare(`SELECT * FROM invites WHERE used_at IS NULL ORDER BY created_at DESC`).all();
  const usados = db.prepare(`SELECT i.*, u.name as cliente_name FROM invites i
    LEFT JOIN clients c ON c.id = i.used_client_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE i.used_at IS NOT NULL ORDER BY i.used_at DESC LIMIT 30`).all();
  const templates = db.prepare(`SELECT * FROM invite_templates ORDER BY name`).all();
  const baseUrl = req.protocol + '://' + req.get('host');
  res.render('admin/convites', {
    title: 'Convites — VS TEAM',
    ativos, usados, templates, baseUrl
  });
});

router.post('/convites', (req, res) => {
  const { label, plan, plan_duration, plan_value, plan_months, request_anamnese, request_photos, expires_in_days } = req.body;
  const token = genToken();
  let expires_at = null;
  if (expires_in_days && parseInt(expires_in_days) > 0) {
    const d = new Date(); d.setDate(d.getDate() + parseInt(expires_in_days));
    expires_at = d.toISOString().slice(0,10);
  }
  db.prepare(`INSERT INTO invites (token, label, plan, plan_duration, plan_value, plan_months, request_anamnese, request_photos, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      token, label || null, plan || null, plan_duration || null,
      parseFloat(plan_value) || null, parseInt(plan_months) || null,
      request_anamnese ? 1 : 0, request_photos ? 1 : 0, expires_at,
      req.session.user.id
    );
  req.flash('success', 'Convite gerado! Copie o link e envie para o cliente.');
  res.redirect('/admin/convites');
});

router.post('/convites/:id/delete', (req, res) => {
  db.prepare('DELETE FROM invites WHERE id = ? AND used_at IS NULL').run(req.params.id);
  req.flash('success', 'Convite removido.');
  res.redirect('/admin/convites');
});

// Templates de convite
router.post('/convite-templates', (req, res) => {
  const { name, plan, plan_duration, plan_value, plan_months, request_anamnese, request_photos } = req.body;
  if (!name) { req.flash('error', 'Nome obrigatório.'); return res.redirect('/admin/convites'); }
  db.prepare(`INSERT INTO invite_templates (name, plan, plan_duration, plan_value, plan_months, request_anamnese, request_photos)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      name, plan || null, plan_duration || null,
      parseFloat(plan_value) || null, parseInt(plan_months) || null,
      request_anamnese ? 1 : 0, request_photos ? 1 : 0
    );
  req.flash('success', 'Template salvo.');
  res.redirect('/admin/convites');
});

router.post('/convite-templates/:id/delete', (req, res) => {
  db.prepare('DELETE FROM invite_templates WHERE id = ?').run(req.params.id);
  res.redirect('/admin/convites');
});

router.post('/convite-templates/:id/usar', (req, res) => {
  // Cria um convite a partir de um template
  const tpl = db.prepare('SELECT * FROM invite_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.redirect('/admin/convites');
  const token = genToken();
  db.prepare(`INSERT INTO invites (token, label, plan, plan_duration, plan_value, plan_months, request_anamnese, request_photos, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      token, 'Via template: ' + tpl.name, tpl.plan, tpl.plan_duration,
      tpl.plan_value, tpl.plan_months, tpl.request_anamnese, tpl.request_photos,
      req.session.user.id
    );
  req.flash('success', 'Convite gerado a partir do template.');
  res.redirect('/admin/convites');
});


// ============ TEMPLATES DE TREINO ============
router.get('/templates-treino', (req, res) => {
  const tpls = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM workout_template_exercises WHERE template_id = t.id) as ex_count
    FROM workout_templates t ORDER BY t.created_at DESC
  `).all();
  res.render('admin/templates-treino', { title: 'Templates de Treino — VS TEAM', tpls });
});

router.post('/templates-treino', (req, res) => {
  const { name, description, focus, day_label, notes } = req.body;
  if (!name) { req.flash('error', 'Nome obrigatório.'); return res.redirect('/admin/templates-treino'); }
  db.prepare(`INSERT INTO workout_templates (name, description, focus, day_label, notes) VALUES (?, ?, ?, ?, ?)`)
    .run(name, description || null, focus || null, day_label || null, notes || null);
  req.flash('success', 'Template criado.');
  res.redirect('/admin/templates-treino');
});

router.get('/templates-treino/:id', (req, res) => {
  const tpl = db.prepare('SELECT * FROM workout_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return res.redirect('/admin/templates-treino');
  const exs = db.prepare('SELECT * FROM workout_template_exercises WHERE template_id = ? ORDER BY order_idx').all(tpl.id);
  const lib = db.prepare('SELECT id, name, muscle_group FROM exercise_library ORDER BY muscle_group, name').all();
  res.render('admin/template-treino-detalhe', { title: tpl.name + ' — Template', tpl, exs, lib });
});

router.post('/templates-treino/:id/update', (req, res) => {
  const { name, description, focus, day_label, notes } = req.body;
  db.prepare(`UPDATE workout_templates SET name=?, description=?, focus=?, day_label=?, notes=? WHERE id=?`)
    .run(name, description || null, focus || null, day_label || null, notes || null, req.params.id);
  req.flash('success', 'Template atualizado.');
  res.redirect(`/admin/templates-treino/${req.params.id}`);
});

router.post('/templates-treino/:id/exercicios', (req, res) => {
  const { name, sets, reps, rest, load_kg, video_url, notes, library_id } = req.body;
  const orderRow = db.prepare('SELECT MAX(order_idx) as m FROM workout_template_exercises WHERE template_id = ?').get(req.params.id);
  const order = (orderRow.m ?? -1) + 1;
  db.prepare(`INSERT INTO workout_template_exercises (template_id, library_id, name, sets, reps, rest, load_kg, video_url, notes, order_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.id, library_id || null, name, sets, reps, rest, load_kg, video_url, notes, order);
  req.flash('success', 'Exercício adicionado.');
  res.redirect(`/admin/templates-treino/${req.params.id}`);
});

router.post('/templates-treino/exercicios/:exId/delete', (req, res) => {
  const ex = db.prepare('SELECT template_id FROM workout_template_exercises WHERE id = ?').get(req.params.exId);
  db.prepare('DELETE FROM workout_template_exercises WHERE id = ?').run(req.params.exId);
  res.redirect(`/admin/templates-treino/${ex ? ex.template_id : ''}`);
});

router.post('/templates-treino/:id/delete', (req, res) => {
  db.prepare('DELETE FROM workout_template_exercises WHERE template_id = ?').run(req.params.id);
  db.prepare('DELETE FROM workout_templates WHERE id = ?').run(req.params.id);
  req.flash('success', 'Template removido.');
  res.redirect('/admin/templates-treino');
});

// Aplicar template em cliente
router.post('/clientes/:clientId/aplicar-template-treino', (req, res) => {
  const { template_id, week_number, day_label } = req.body;
  const tpl = db.prepare('SELECT * FROM workout_templates WHERE id = ?').get(template_id);
  if (!tpl) { req.flash('error', 'Template não encontrado.'); return res.redirect(`/admin/clientes/${req.params.clientId}#treinos`); }
  const cliente = db.prepare('SELECT current_week FROM clients WHERE id = ?').get(req.params.clientId);
  const week = parseInt(week_number) || (cliente ? cliente.current_week : 1);
  const dayL = day_label || tpl.day_label || 'A';

  const wId = db.prepare(`INSERT INTO workouts (client_id, week_number, day_label, title, focus, notes) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(req.params.clientId, week, dayL, tpl.name, tpl.focus, tpl.notes).lastInsertRowid;

  const exs = db.prepare('SELECT * FROM workout_template_exercises WHERE template_id = ? ORDER BY order_idx').all(template_id);
  const stmt = db.prepare(`INSERT INTO exercises (workout_id, library_id, name, sets, reps, rest, load_kg, video_url, notes, order_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  exs.forEach(e => stmt.run(wId, e.library_id, e.name, e.sets, e.reps, e.rest, e.load_kg, e.video_url, e.notes, e.order_idx));

  req.flash('success', `Template "${tpl.name}" aplicado: ${exs.length} exercícios na semana ${week}, treino ${dayL}.`);
  res.redirect(`/admin/clientes/${req.params.clientId}#treinos`);
});

// ============ TEMPLATES DE DIETA ============
router.get('/templates-dieta', (req, res) => {
  const tpls = db.prepare('SELECT * FROM diet_templates ORDER BY created_at DESC').all();
  res.render('admin/templates-dieta', { title: 'Templates de Dieta — VS TEAM', tpls });
});

router.post('/templates-dieta', (req, res) => {
  const { name, description, calories, protein, carbs, fats, meal_plan, notes } = req.body;
  if (!name) { req.flash('error', 'Nome obrigatório.'); return res.redirect('/admin/templates-dieta'); }
  db.prepare(`INSERT INTO diet_templates (name, description, calories, protein, carbs, fats, meal_plan, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, description || null, calories || null, protein || null, carbs || null, fats || null, meal_plan || null, notes || null);
  req.flash('success', 'Template de dieta criado.');
  res.redirect('/admin/templates-dieta');
});

router.post('/templates-dieta/:id/update', (req, res) => {
  const { name, description, calories, protein, carbs, fats, meal_plan, notes } = req.body;
  db.prepare(`UPDATE diet_templates SET name=?, description=?, calories=?, protein=?, carbs=?, fats=?, meal_plan=?, notes=? WHERE id=?`)
    .run(name, description || null, calories || null, protein || null, carbs || null, fats || null, meal_plan || null, notes || null, req.params.id);
  req.flash('success', 'Template atualizado.');
  res.redirect('/admin/templates-dieta');
});

router.post('/templates-dieta/:id/delete', (req, res) => {
  db.prepare('DELETE FROM diet_templates WHERE id = ?').run(req.params.id);
  req.flash('success', 'Template removido.');
  res.redirect('/admin/templates-dieta');
});

router.post('/clientes/:clientId/aplicar-template-dieta', (req, res) => {
  const { template_id, week_number } = req.body;
  const tpl = db.prepare('SELECT * FROM diet_templates WHERE id = ?').get(template_id);
  if (!tpl) { req.flash('error', 'Template não encontrado.'); return res.redirect(`/admin/clientes/${req.params.clientId}#dieta`); }
  const cliente = db.prepare('SELECT current_week FROM clients WHERE id = ?').get(req.params.clientId);
  const week = parseInt(week_number) || (cliente ? cliente.current_week : 1);

  db.prepare(`INSERT INTO diets (client_id, week_number, meal_plan, calories, protein, carbs, fats, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.clientId, week, tpl.meal_plan, tpl.calories, tpl.protein, tpl.carbs, tpl.fats, tpl.notes);

  req.flash('success', `Dieta "${tpl.name}" aplicada na semana ${week}.`);
  res.redirect(`/admin/clientes/${req.params.clientId}#dieta`);
});


// ============ EXPORTAÇÃO PDF (página imprimível) ============
router.get('/clientes/:id/pdf-treino', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name, u.email FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.params.id);
  if (!cliente) return res.redirect('/admin/clientes');
  const week = parseInt(req.query.week) || cliente.current_week || 1;
  const workouts = db.prepare(`SELECT * FROM workouts WHERE client_id = ? AND week_number = ? ORDER BY day_label ASC`).all(cliente.id, week);
  const fullWorkouts = workouts.map(w => ({
    ...w,
    exercises: db.prepare('SELECT * FROM exercises WHERE workout_id = ? ORDER BY order_idx').all(w.id)
  }));
  res.render('admin/pdf-treino', {
    title: `${cliente.name} — Treino S${week}`,
    cliente, week, workouts: fullWorkouts,
    geradoEm: new Date().toLocaleDateString('pt-BR')
  });
});

router.get('/clientes/:id/pdf-dieta', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name, u.email FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.params.id);
  if (!cliente) return res.redirect('/admin/clientes');
  const week = parseInt(req.query.week) || cliente.current_week || 1;
  const diet = db.prepare(`SELECT * FROM diets WHERE client_id = ? AND week_number = ? ORDER BY created_at DESC LIMIT 1`).get(cliente.id, week);
  const allDiets = db.prepare(`SELECT week_number FROM diets WHERE client_id = ? ORDER BY week_number DESC`).all(cliente.id);
  res.render('admin/pdf-dieta', {
    title: `${cliente.name} — Dieta S${week}`,
    cliente, week, diet, allDiets,
    geradoEm: new Date().toLocaleDateString('pt-BR')
  });
});


// ============ PROGRESSÃO DE CARGA ============
router.get('/clientes/:id/progressao', (req, res) => {
  const cliente = db.prepare(`SELECT c.*, u.name FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(req.params.id);
  if (!cliente) return res.redirect('/admin/clientes');
  const progression = getExerciseProgression(db, cliente.id);
  res.render('admin/progressao', { title: `Progressão — ${cliente.name}`, cliente, progression });
});


// Excluir alunos em massa
router.post('/clientes/excluir-em-massa', (req, res) => {
  let ids = req.body.ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.filter(Boolean).map(Number).filter(n => n > 0);
  if (ids.length === 0) {
    req.flash('error', 'Nenhum aluno selecionado.');
    return res.redirect(req.get('Referrer') || '/admin/clientes');
  }
  let count = 0;
  ids.forEach(id => {
    const c = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(id);
    if (c) {
      db.prepare('DELETE FROM clients WHERE id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(c.user_id);
      count++;
    }
  });
  req.flash('success', count + ' aluno(s) removido(s).');
  res.redirect(req.get('Referrer') || '/admin/clientes');
});

module.exports = router;
