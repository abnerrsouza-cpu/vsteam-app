const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/cliente');
  }
  res.render('auth/login', { title: 'Entrar — VS TEAM' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    req.flash('error', 'Email ou senha inválidos.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  // Se cliente, carrega o client_id também
  if (user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(user.id);
    req.session.user.client_id = client?.id || null;
  }

  res.redirect(user.role === 'admin' ? '/admin' : '/cliente');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});


// ============ CONVITE PÚBLICO (sem auth) ============
const multer_inv = require('multer');
const path_inv = require('path');
const fs_inv = require('fs');

const inviteUpload = multer_inv({
  storage: multer_inv.diskStorage({
    destination: (req, file, cb) => {
      const dir = path_inv.join(__dirname, '..', 'public', 'uploads');
      if (!fs_inv.existsSync(dir)) fs_inv.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path_inv.extname(file.originalname);
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2,7) + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.get('/convite/:token', (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(req.params.token);
  if (!inv) {
    return res.status(404).render('auth/error', { message: 'Convite inválido ou expirado.', code: 404 });
  }
  if (inv.used_at) {
    return res.status(410).render('auth/error', { message: 'Este convite já foi utilizado.', code: 410 });
  }
  if (inv.expires_at && inv.expires_at < new Date().toISOString().slice(0,10)) {
    return res.status(410).render('auth/error', { message: 'Convite expirado. Peça um novo ao Victor.', code: 410 });
  }
  const template = inv.request_anamnese
    ? db.prepare("SELECT * FROM questionnaire_template WHERE active = 1 ORDER BY order_idx ASC, id ASC").all()
    : [];
  res.render('auth/convite', { title: 'Bem-vindo à VS TEAM', invite: inv, template });
});

router.post('/convite/:token', inviteUpload.array('photos', 4), (req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token = ? AND used_at IS NULL').get(req.params.token);
  if (!inv) return res.status(404).send('Convite inválido.');

  const { name, email, password, phone, instagram } = req.body;
  if (!name || !email || !password) {
    req.flash('error', 'Preencha nome, email e senha.');
    return res.redirect('/convite/' + req.params.token);
  }

  try {
    // Verifica se email já existe
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      req.flash('error', 'Já existe uma conta com esse email. Tente fazer login.');
      return res.redirect('/convite/' + req.params.token);
    }

    // Cria user + client
    const hash = bcrypt.hashSync(password, 10);
    const userId = db.prepare(`INSERT INTO users (name, email, password_hash, role, phone, instagram) VALUES (?, ?, ?, 'client', ?, ?)`)
      .run(name, email.toLowerCase().trim(), hash, phone || null, instagram || null).lastInsertRowid;

    // Calcula end_date com base em plan_months do convite
    let end_date = null;
    if (inv.plan_months && inv.plan_months > 0) {
      const d = new Date(); d.setMonth(d.getMonth() + inv.plan_months);
      end_date = d.toISOString().slice(0,10);
    }

    const start_date = new Date().toISOString().slice(0,10);
    const clientId = db.prepare(`INSERT INTO clients (user_id, plan, plan_duration, value, start_date, end_date, status, implementation_step, current_week)
      VALUES (?, ?, ?, ?, ?, ?, 'implementacao', 0, 1)`).run(
        userId, inv.plan, inv.plan_duration, inv.plan_value, start_date, end_date
      ).lastInsertRowid;

    // Salvar respostas do questionário (se foi pedido)
    if (inv.request_anamnese) {
      const template = db.prepare("SELECT q_key FROM questionnaire_template WHERE active = 1").all();
      const answers = {};
      template.forEach(q => { answers[q.q_key] = (req.body[q.q_key] || '').trim(); });
      const goal = answers.objetivo || null;
      const weight = parseFloat(answers.peso_atual) || null;
      const height = parseFloat(answers.altura_cm) || null;
      const age = parseInt(answers.idade) || null;
      db.prepare(`INSERT INTO questionnaires (client_id, goal, weight, height, age, answers_json) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(clientId, goal, weight, height, age, JSON.stringify(answers));
      db.prepare(`UPDATE clients SET implementation_step = 1 WHERE id = ?`).run(clientId);
    }

    // Salvar fotos iniciais
    if (inv.request_photos && req.files && req.files.length > 0) {
      const stmt = db.prepare(`INSERT INTO photos (client_id, category, filename, week_number, caption) VALUES (?, 'antes', ?, 1, ?)`);
      req.files.forEach(f => stmt.run(clientId, f.filename, 'Foto inicial — convite'));
      db.prepare(`UPDATE clients SET implementation_step = MAX(implementation_step, 2) WHERE id = ?`).run(clientId);
    }

    // Marca convite como usado
    db.prepare(`UPDATE invites SET used_at = datetime('now'), used_client_id = ? WHERE id = ?`).run(clientId, inv.id);

    // Loga o cliente direto
    req.session.user = { id: userId, name, email: email.toLowerCase().trim(), role: 'client', client_id: clientId };
    req.flash('success', 'Bem-vindo à VS TEAM! Sua jornada começa agora.');
    res.redirect('/cliente');
  } catch (e) {
    console.error('convite:', e);
    req.flash('error', 'Erro ao processar: ' + e.message);
    res.redirect('/convite/' + req.params.token);
  }
});

module.exports = router;
