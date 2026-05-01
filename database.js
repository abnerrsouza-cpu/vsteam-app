// VS TEAM - Database SQLite (schema + seed)
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');


// Retorna a segunda-feira da semana da data dada
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dom, 1=seg, ..., 6=sab
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'vsteam.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== SCHEMA ==========
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','client')),
  phone TEXT,
  instagram TEXT,
  avatar TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  instagram TEXT,
  source TEXT CHECK (source IN ('academia','story','indicacao','outro')),
  referred_by TEXT,
  stage TEXT NOT NULL DEFAULT 'captacao'
    CHECK (stage IN ('captacao','conversa','vendas','negociacao','contrato','convertido','perdido')),
  plan TEXT,
  plan_duration TEXT,
  value REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  converted_at TEXT,
  converted_client_id INTEGER
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  lead_id INTEGER,
  plan TEXT,
  plan_duration TEXT,
  value REAL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'implementacao'
    CHECK (status IN ('implementacao','ativo','pausado','encerrado')),
  implementation_step INTEGER DEFAULT 0,
  gym_cats_points INTEGER DEFAULT 0,
  current_week INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questionnaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  goal TEXT,
  experience TEXT,
  weight REAL,
  height REAL,
  age INTEGER,
  medical_history TEXT,
  food_preferences TEXT,
  food_restrictions TEXT,
  available_days INTEGER,
  training_location TEXT,
  notes TEXT,
  submitted_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  day_label TEXT NOT NULL,
  title TEXT,
  focus TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL,
  library_id INTEGER,
  name TEXT NOT NULL,
  sets TEXT,
  reps TEXT,
  rest TEXT,
  load_kg TEXT,
  video_url TEXT,
  notes TEXT,
  order_idx INTEGER DEFAULT 0,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  checked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  meal_plan TEXT,
  calories INTEGER,
  protein INTEGER,
  carbs INTEGER,
  fats INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('antes','depois','semanal')),
  filename TEXT NOT NULL,
  week_number INTEGER,
  caption TEXT,
  taken_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  weight REAL,
  chest REAL,
  waist REAL,
  hip REAL,
  arm REAL,
  leg REAL,
  notes TEXT,
  submitted_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  analysis TEXT,
  optimizations TEXT,
  next_steps TEXT,
  sent_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  video_url TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gym_cats_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  points INTEGER NOT NULL,
  earned_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  type TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  message TEXT,
  sent_at TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','cancelado')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  workout_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido','cancelado')),
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_sec INTEGER DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_session_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  weight REAL,
  reps INTEGER,
  notes TEXT,
  recorded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  focus TEXT,
  day_label TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  library_id INTEGER,
  name TEXT NOT NULL,
  sets TEXT,
  reps TEXT,
  rest TEXT,
  load_kg TEXT,
  video_url TEXT,
  notes TEXT,
  order_idx INTEGER DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diet_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  calories INTEGER,
  protein INTEGER,
  carbs INTEGER,
  fats INTEGER,
  meal_plan TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  label TEXT,
  plan TEXT,
  plan_duration TEXT,
  plan_value REAL,
  plan_months INTEGER,
  request_anamnese INTEGER DEFAULT 1,
  request_photos INTEGER DEFAULT 1,
  expires_at TEXT,
  used_at TEXT,
  used_client_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invite_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plan TEXT,
  plan_duration TEXT,
  plan_value REAL,
  plan_months INTEGER,
  request_anamnese INTEGER DEFAULT 1,
  request_photos INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questionnaire_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'textarea',
  options TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  order_idx INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  stage_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  order_idx INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ========== SEED ==========
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) {
    console.log('⚠  Banco já possui dados, seed ignorado. Para resetar, apague data/vsteam.db');
    return;
  }
  console.log('🌱 Populando banco com dados iniciais...');

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone, instagram)
    VALUES (?, ?, ?, ?, ?, ?)`);

  // Admin (Victor)
  const adminHash = bcrypt.hashSync('vsteam2026', 10);
  const adminId = insertUser.run('Victor', 'victor@vsteam.com', adminHash, 'admin', '+5511999990000', '@vsteam.victor').lastInsertRowid;

  // Cliente exemplo
  const clientHash = bcrypt.hashSync('cliente123', 10);
  const joaoUserId = insertUser.run('João Silva', 'joao@cliente.com', clientHash, 'client', '+5511988887777', '@joao.silva').lastInsertRowid;
  const mariaUserId = insertUser.run('Maria Costa', 'maria@cliente.com', clientHash, 'client', '+5511977776666', '@maria.costa').lastInsertRowid;
  const pedroUserId = insertUser.run('Pedro Santos', 'pedro@cliente.com', clientHash, 'client', '+5511966665555', '@pedro.santos').lastInsertRowid;

  const insertClient = db.prepare(`
    INSERT INTO clients (user_id, plan, plan_duration, value, start_date, status, implementation_step, current_week, gym_cats_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const joaoId = insertClient.run(joaoUserId, 'Consultoria VIP', '3 meses', 897.00, '2026-03-01', 'ativo', 3, 8, 320).lastInsertRowid;
  const mariaId = insertClient.run(mariaUserId, 'Consultoria Start', '1 mês', 397.00, '2026-04-10', 'implementacao', 1, 1, 50).lastInsertRowid;
  const pedroId = insertClient.run(pedroUserId, 'Consultoria Premium', '6 meses', 1497.00, '2026-01-15', 'ativo', 3, 14, 580).lastInsertRowid;

  // Questionário João
  db.prepare(`INSERT INTO questionnaires (client_id, goal, experience, weight, height, age, available_days, training_location, food_preferences, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(joaoId, 'Hipertrofia - ganhar 5kg de massa magra', 'Intermediário (2 anos)', 82.5, 178, 29, 5, 'Academia Fit Center', 'Adoro frango, arroz, batata doce', 'Sem lactose');

  db.prepare(`INSERT INTO questionnaires (client_id, goal, experience, weight, height, age, available_days, training_location, food_preferences, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(pedroId, 'Definição muscular - reduzir BF', 'Avançado (5 anos)', 88.0, 182, 33, 6, 'Smart Fit', 'Flexível, sem carboidratos refinados', 'Operado do joelho direito em 2022');

  // Leads no pipeline
  const insertLead = db.prepare(`
    INSERT INTO leads (name, phone, instagram, source, referred_by, stage, plan, plan_duration, value, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertLead.run('Carlos Ferreira', '+5511955554444', '@carlos.ferreira', 'academia', null, 'captacao', null, null, null, 'Puxei papo no leg day');
  insertLead.run('Ana Paula Lima', '+5511944443333', '@anapaula.lima', 'story', null, 'conversa', null, null, null, 'Perguntou sobre plano mensal pelo Direct');
  insertLead.run('Rafael Alves', '+5511933332222', '@rafael.alves', 'indicacao', 'João Silva', 'vendas', null, null, null, 'Quer perder 10kg, preciso quebrar objeção de preço');
  insertLead.run('Beatriz Rocha', '+5511922221111', '@bia.rocha', 'story', null, 'negociacao', 'Consultoria VIP', '3 meses', 897.00, 'Avaliando plano VIP ou Start');
  insertLead.run('Lucas Martins', '+5511911110000', '@lucas.martins', 'academia', null, 'contrato', 'Consultoria Premium', '6 meses', 1497.00, 'Contrato enviado, aguardando assinatura');

  // Biblioteca de exercícios
  const insertLib = db.prepare(`
    INSERT INTO exercise_library (name, muscle_group, equipment, video_url, description)
    VALUES (?, ?, ?, ?, ?)`);
  const libItems = [
    ['Supino Reto com Barra', 'Peito', 'Barra livre', 'https://www.youtube.com/embed/rT7DgCr-3pg', 'Deita no banco reto, barra na linha do peito, empurra com força.'],
    ['Agachamento Livre', 'Pernas', 'Barra livre', 'https://www.youtube.com/embed/ultWZbUMPL8', 'Barra nos trapézios, desce até coxas paralelas ao chão.'],
    ['Levantamento Terra', 'Posterior + Lombar', 'Barra livre', 'https://www.youtube.com/embed/op9kVnSso6Q', 'Movimento composto essencial para força global.'],
    ['Puxada Alta', 'Costas', 'Polia alta', 'https://www.youtube.com/embed/CAwf7n6Luuc', 'Puxe a barra até a altura do peito, contraindo as escápulas.'],
    ['Desenvolvimento Militar', 'Ombros', 'Halter', 'https://www.youtube.com/embed/qEwKCR5JCog', 'Empurre halteres acima da cabeça, mantendo core ativo.'],
    ['Rosca Direta', 'Bíceps', 'Barra W', 'https://www.youtube.com/embed/kwG2ipFRgfo', 'Flexione cotovelos, cotovelos fixos ao lado do corpo.'],
    ['Tríceps Corda', 'Tríceps', 'Polia', 'https://www.youtube.com/embed/kiuVA0gs3EI', 'Extensão completa, pressionando os tríceps no final.'],
    ['Cadeira Extensora', 'Quadríceps', 'Máquina', 'https://www.youtube.com/embed/YyvSfVjQeL0', 'Movimento isolador de quadríceps.'],
    ['Stiff', 'Posterior de coxa', 'Halter', 'https://www.youtube.com/embed/CN_7cz3P-1U', 'Joelhos levemente flexionados, desce com o tronco.'],
    ['Prancha Abdominal', 'Core', 'Peso corporal', 'https://www.youtube.com/embed/pSHjTRCQxIw', 'Mantenha corpo alinhado, contrai core e glúteos.']
  ];
  libItems.forEach(e => insertLib.run(...e));

  // Treinos do João (semana 8)
  const insertWorkout = db.prepare(`INSERT INTO workouts (client_id, week_number, day_label, title, focus, notes) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertEx = db.prepare(`INSERT INTO exercises (workout_id, library_id, name, sets, reps, rest, load_kg, video_url, order_idx, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const wA = insertWorkout.run(joaoId, 8, 'A', 'Treino A - Peito + Tríceps', 'Hipertrofia', 'Cadência 3-1-1, descanso 90s.').lastInsertRowid;
  insertEx.run(wA, 1, 'Supino Reto com Barra', '4', '8-10', '90s', '70', 'https://www.youtube.com/embed/rT7DgCr-3pg', 0, 'Foco na fase excêntrica');
  insertEx.run(wA, 7, 'Tríceps Corda', '4', '12', '60s', '25', 'https://www.youtube.com/embed/kiuVA0gs3EI', 1, 'Contração no final');

  const wB = insertWorkout.run(joaoId, 8, 'B', 'Treino B - Costas + Bíceps', 'Hipertrofia', null).lastInsertRowid;
  insertEx.run(wB, 4, 'Puxada Alta', '4', '10', '75s', '60', 'https://www.youtube.com/embed/CAwf7n6Luuc', 0, null);
  insertEx.run(wB, 6, 'Rosca Direta', '3', '12', '60s', '20', 'https://www.youtube.com/embed/kwG2ipFRgfo', 1, null);

  const wC = insertWorkout.run(joaoId, 8, 'C', 'Treino C - Pernas', 'Força', 'Aquecimento obrigatório.').lastInsertRowid;
  insertEx.run(wC, 2, 'Agachamento Livre', '5', '6', '120s', '100', 'https://www.youtube.com/embed/ultWZbUMPL8', 0, 'Desce controlado');
  insertEx.run(wC, 9, 'Stiff', '4', '10', '90s', '70', 'https://www.youtube.com/embed/CN_7cz3P-1U', 1, null);
  insertEx.run(wC, 8, 'Cadeira Extensora', '3', '15', '60s', '50', 'https://www.youtube.com/embed/YyvSfVjQeL0', 2, null);

  // Dieta do João
  db.prepare(`INSERT INTO diets (client_id, week_number, meal_plan, calories, protein, carbs, fats, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(joaoId, 8,
      'Café: 4 ovos + 60g aveia + 1 banana\nAlmoço: 200g frango + 150g arroz + salada\nLanche: 30g whey + 1 maçã\nJantar: 200g patinho + 200g batata doce\nCeia: 250g iogurte natural',
      3200, 220, 360, 90, 'Beber 4L de água/dia. Suplementação: whey, creatina 5g.');

  // Avaliações do João (progresso)
  const insertEval = db.prepare(`INSERT INTO evaluations (client_id, week_number, weight, chest, waist, hip, arm, leg, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertEval.run(joaoId, 1, 82.5, 98, 85, 95, 36, 58, 'Início');
  insertEval.run(joaoId, 4, 83.2, 99, 84, 95, 36.5, 58.5, 'Sem alteração relevante');
  insertEval.run(joaoId, 7, 84.0, 100, 83, 95, 37, 59, 'Volume crescendo');
  insertEval.run(joaoId, 8, 84.5, 100.5, 83, 95, 37, 59.5, 'Rampa de progresso');

  // Feedback semana passada
  db.prepare(`INSERT INTO feedbacks (client_id, week_number, analysis, optimizations, next_steps) VALUES (?, ?, ?, ?, ?)`)
    .run(joaoId, 7, 'Ganho de 1.5kg em 7 semanas com visual mais denso. Cintura estável (bom sinal).',
         'Aumentar carga no supino (+5kg). Adicionar 1 set extra nas costas.',
         'Foco em posterior de coxa na semana 8. Manter ingestão calórica.');

  // Gym Cats events (pontuação)
  const gc = db.prepare(`INSERT INTO gym_cats_events (client_id, action, points) VALUES (?, ?, ?)`);
  gc.run(joaoId, 'Check-in semanal completo', 50);
  gc.run(joaoId, 'Envio de fotos semana 7', 30);
  gc.run(joaoId, 'Ficha de avaliação enviada', 40);
  gc.run(pedroId, 'Check-in semanal completo', 50);
  gc.run(pedroId, 'Envio de fotos semana 13', 30);
  gc.run(pedroId, 'Ficha de avaliação enviada', 40);
  gc.run(pedroId, '4 semanas consecutivas de fotos', 100);
  gc.run(mariaId, 'Questionário inicial preenchido', 50);

  // Lembretes
  const rem = db.prepare(`INSERT INTO reminders (client_id, type, scheduled_for, message, status) VALUES (?, ?, ?, ?, ?)`);
  const hoje = new Date().toISOString().slice(0,10);
  rem.run(joaoId, 'fotos_semanais', hoje, 'Oi João! Lembrete VS TEAM: envia suas fotos e ficha até sábado pra gente otimizar tua semana 🔥', 'pendente');
  rem.run(pedroId, 'fotos_semanais', hoje, 'Fala Pedro! Manda fotos e ficha até sábado 💪', 'pendente');
  rem.run(mariaId, 'questionario', hoje, 'Maria, bora preencher o questionário inicial pra eu montar teu treino?', 'pendente');

  // Semana operacional global
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('operational_week', '8')`).run();
  // Data que a semana 1 do ciclo começou (segunda-feira de referência)
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('cycle_start_date', ?)`).run(getMondayOf(new Date(Date.now() - 7*7*24*60*60*1000)).toISOString().slice(0,10));


  // Colunas do pipeline (customizáveis)
  const insertStage = db.prepare(`INSERT OR IGNORE INTO pipeline_stages (stage_key, display_name, description, order_idx) VALUES (?, ?, ?, ?)`);
  insertStage.run('conversa', 'Em Conversa', 'Interesse inicial', 0);
  insertStage.run('vendas', 'Vendas', 'Quebra de objeção', 1);
  insertStage.run('negociacao', 'Negociação', 'Plano + Prazo', 2);
  insertStage.run('contrato', 'Contrato', 'Assinatura pendente', 3);

  console.log('✅ Seed concluído.');
  console.log('   Admin: victor@vsteam.com / vsteam2026');
  console.log('   Cliente: joao@cliente.com / cliente123');
}

// Auto-seed: roda automaticamente se o banco estiver vazio (primeira deploy)
(function autoSeedIfEmpty() {
  try {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get();
    if (row && row.c === 0) {
      console.log('🌱 Banco vazio detectado, rodando seed automático...');
      seed();
    }
  } catch(e) { console.error('auto-seed:', e.message); }
})();

if (require.main === module && process.argv.includes('--seed')) {
  seed();
  process.exit(0);
}

// Auto-migração: garantir pipeline_stages existe com defaults
// Auto-migração para colunas novas
(function ensureWorkoutSessions() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      workout_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      duration_sec INTEGER DEFAULT 0,
      notes TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS workout_session_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      weight REAL,
      reps INTEGER,
      notes TEXT,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`);
    const cols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
    if (!cols.includes('allow_screenshot')) {
      db.exec("ALTER TABLE clients ADD COLUMN allow_screenshot INTEGER DEFAULT 0");
    }
  } catch(e) { console.error('migrate workout_sessions:', e.message); }
})();

(function ensureTemplates() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS workout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT, focus TEXT, day_label TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS workout_template_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL, library_id INTEGER,
      name TEXT NOT NULL, sets TEXT, reps TEXT, rest TEXT, load_kg TEXT,
      video_url TEXT, notes TEXT, order_idx INTEGER DEFAULT 0
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS diet_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT,
      calories INTEGER, protein INTEGER, carbs INTEGER, fats INTEGER,
      meal_plan TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) { console.error('migrate templates:', e.message); }
})();

(function ensureInvites() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  focus TEXT,
  day_label TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  library_id INTEGER,
  name TEXT NOT NULL,
  sets TEXT,
  reps TEXT,
  rest TEXT,
  load_kg TEXT,
  video_url TEXT,
  notes TEXT,
  order_idx INTEGER DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diet_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  calories INTEGER,
  protein INTEGER,
  carbs INTEGER,
  fats INTEGER,
  meal_plan TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      label TEXT,
      plan TEXT, plan_duration TEXT, plan_value REAL, plan_months INTEGER,
      request_anamnese INTEGER DEFAULT 1, request_photos INTEGER DEFAULT 1,
      expires_at TEXT, used_at TEXT, used_client_id INTEGER,
      created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS invite_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plan TEXT, plan_duration TEXT, plan_value REAL, plan_months INTEGER,
      request_anamnese INTEGER DEFAULT 1, request_photos INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) { console.error('migrate invites:', e.message); }
})();

(function ensureExtraColumns() {
  try {
    const cols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
    if (!cols.includes('welcomed_at')) {
      db.exec("ALTER TABLE clients ADD COLUMN welcomed_at TEXT");
    }
    const qcols = db.prepare("PRAGMA table_info(questionnaires)").all().map(c => c.name);
    if (!qcols.includes('answers_json')) {
      db.exec("ALTER TABLE questionnaires ADD COLUMN answers_json TEXT");
    }
    db.exec(`CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  workout_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido','cancelado')),
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_sec INTEGER DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_session_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  weight REAL,
  reps INTEGER,
  notes TEXT,
  recorded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  focus TEXT,
  day_label TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  library_id INTEGER,
  name TEXT NOT NULL,
  sets TEXT,
  reps TEXT,
  rest TEXT,
  load_kg TEXT,
  video_url TEXT,
  notes TEXT,
  order_idx INTEGER DEFAULT 0,
  FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diet_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  calories INTEGER,
  protein INTEGER,
  carbs INTEGER,
  fats INTEGER,
  meal_plan TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  label TEXT,
  plan TEXT,
  plan_duration TEXT,
  plan_value REAL,
  plan_months INTEGER,
  request_anamnese INTEGER DEFAULT 1,
  request_photos INTEGER DEFAULT 1,
  expires_at TEXT,
  used_at TEXT,
  used_client_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invite_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plan TEXT,
  plan_duration TEXT,
  plan_value REAL,
  plan_months INTEGER,
  request_anamnese INTEGER DEFAULT 1,
  request_photos INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questionnaire_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      q_key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'textarea',
      options TEXT,
      required INTEGER NOT NULL DEFAULT 1,
      order_idx INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch(e) { console.error('migrate extra:', e.message); }
})();

(function ensureQuestionnaireSeed() {
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM questionnaire_template').get().c;
    if (count > 0) return;
    const ins = db.prepare(`INSERT INTO questionnaire_template (q_key, label, field_type, options, required, order_idx) VALUES (?, ?, ?, ?, ?, ?)`);
    const seed = [
      ['nome_completo', 'Nome completo', 'text', null, 1],
      ['idade', 'Idade', 'number', null, 1],
      ['altura_cm', 'Altura (cm)', 'number', null, 1],
      ['peso_atual', 'Peso atual (kg)', 'number', null, 1],
      ['rotina_diaria', 'Qual é a sua rotina diária (trabalho, estudos, etc.)?', 'textarea', null, 1],
      ['alimentacao_dia', 'Descreva um dia típico de alimentação (quantas refeições e o que costuma comer em cada uma)', 'textarea', null, 1],
      ['alimento_favorito', 'Qual alimento te faria feliz se tivesse todo dia na sua dieta? (Pode ser bobeira, doce etc)', 'textarea', null, 1],
      ['alimento_aversao', 'Quais alimentos você NÃO gosta ou sente dificuldade em comer?', 'textarea', null, 1],
      ['suplementos', 'Faz uso de suplementos? Se sim, quais?', 'textarea', null, 1],
      ['dificuldades', 'Quais são as principais dificuldades que você enfrenta em relação à alimentação e estilo de vida?', 'textarea', null, 1],
      ['atividade_diaria', 'Qual é o seu nível de atividade diária? Você trabalha sentado ou em pé durante a maior parte do dia?', 'textarea', null, 1],
      ['lesoes_cirurgias', 'Você tem alguma lesão ou problema médico atual? Passou por alguma cirurgia? Se sim, qual e há quanto tempo?', 'textarea', null, 1],
      ['condicoes_medicas', 'Você tem alguma condição médica pré-existente que possa afetar seu treinamento (hipertensão, diabetes, asma, doença cardíaca etc)?', 'textarea', null, 1],
      ['medicamentos', 'Faz uso de algum medicamento ou esteroides anabolizantes?', 'textarea', null, 1],
      ['fuma_alcool', 'Você fuma ou consome bebidas alcoólicas regularmente?', 'textarea', null, 1],
      ['objetivo', 'Qual é o seu objetivo ao procurar nossa consultoria (perda de peso, ganho de massa muscular, melhoria da saúde geral etc)?', 'textarea', null, 1],
      ['nivel_atividade_fisica', 'Qual é o seu nível de atividade física?', 'select', '["Sedentário","Moderado","Ativo"]', 1],
      ['areas_foco', 'Você tem alguma área do corpo que gostaria de focar mais (pernas, abdômen, braços etc)?', 'textarea', null, 1],
      ['disponibilidade_treino', 'Qual a sua disponibilidade para treinar (dias da semana)?', 'textarea', null, 1],
      ['tempo_treino', 'Quanto tempo disponível para treinar por sessão?', 'textarea', null, 1],
      ['horario_treino', 'Que horas geralmente você treina?', 'textarea', null, 1]
    ];
    seed.forEach((q, i) => ins.run(q[0], q[1], q[2], q[3], q[4], i));
  } catch(e) { console.error('seed questionnaire:', e.message); }
})();

// Desativar clientes com plano vencido + carência ao iniciar servidor
(function autoDeactivateExpired() {
  try {
    const enabled = db.prepare("SELECT value FROM settings WHERE key='auto_deactivate_enabled'").get();
    if (!enabled || enabled.value !== '1') return;
    const grace = db.prepare("SELECT value FROM settings WHERE key='auto_deactivate_grace_days'").get();
    const days = grace ? parseInt(grace.value) || 0 : 2;
    const result = db.prepare(`
      UPDATE clients SET status = 'encerrado'
      WHERE status IN ('ativo','implementacao')
        AND end_date IS NOT NULL
        AND date(end_date, '+' || ? || ' days') < date('now')
    `).run(days);
    if (result.changes > 0) console.log(`[auto-deactivate] ${result.changes} cliente(s) encerrado(s) por vencimento.`);
  } catch(e) { console.error('auto-deactivate:', e.message); }
})();

(function ensureSettings() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('operational_week', '1')`).run();
    const defaultMonday = getMondayOf(new Date()).toISOString().slice(0,10);
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('cycle_start_date', ?)`).run(defaultMonday);
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_deactivate_enabled', '1')").run();
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_deactivate_grace_days', '2')").run();
  } catch(e) { console.error('migrate settings:', e.message); }
})();

(function ensureStages() {
  try {
    const existingTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_stages'").get();
    if (existingTable) {
      const count = db.prepare('SELECT COUNT(*) as c FROM pipeline_stages').get().c;
      if (count === 0) {
        const ins = db.prepare(`INSERT INTO pipeline_stages (stage_key, display_name, description, order_idx) VALUES (?, ?, ?, ?)`);
        ins.run('conversa', 'Em Conversa', 'Interesse inicial', 0);
        ins.run('vendas', 'Vendas', 'Quebra de objeção', 1);
        ins.run('negociacao', 'Negociação', 'Plano + Prazo', 2);
        ins.run('contrato', 'Contrato', 'Assinatura pendente', 3);
      }
    }
  } catch(e) { console.error('migrate stages:', e.message); }
})();

module.exports = db;
module.exports.seed = seed;
