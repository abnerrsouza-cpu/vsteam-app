// VS TEAM APP — Express Server
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const fs = require('fs');

const db = require('./database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const { requireAuth, requireRole } = require('./middleware/auth');
const ICONS = require('./helpers/icons');

const app = express();
const PORT = process.env.PORT || 3000;

// Uploads folder
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'vs-team-secret-' + Math.random().toString(36).slice(2),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 dias
}));
app.use(flash());

// Defaults seguros para TODAS as views — evita "X is not defined"
const VIEW_DEFAULTS = {
  // dashboards
  totalClients: 0, position: 0, photosCount: 0,
  activeSession: null, isFirstTime: false, hasQuestionnaire: true,
  lastFeedback: null, firstEval: null, lastEval: null,
  workouts: [], evals: [], proximosVenc: [],
  venc: { hoje: 0, sete_dias: 0, vencidos: 0, sem_vigencia: 0 },
  stats: { leads_total: 0, leads_captacao: 0, leads_vendas: 0, leads_contrato: 0, clientes_implementacao: 0, clientes_ativos: 0, clientes_total: 0, receita_mes: 0 },
  leadsRecentes: [], clientesAtencao: [],
  // outras
  treinoTpls: [], dietaTpls: [],
  operationalWeek: 1, weekRange: { label: '—', start: '', end: '' },
  template: [], answers: {}, existing: null,
  questionnaire: null, photos: [], diets: [], feedbacks: []
};

// Locals disponíveis em todas as views
app.use((req, res, next) => {
  // Aplica defaults primeiro
  Object.assign(res.locals, VIEW_DEFAULTS);
  res.locals.currentUser = req.session.user || null;
  res.locals.ICONS = ICONS;
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.currentPath = req.path;
  const logoPath = path.join(__dirname, 'public', 'logos', 'logo.png');
  res.locals.hasLogo = fs.existsSync(logoPath);
  next();
});

// Rotas
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/cliente');
  }
  res.redirect('/login');
});

app.use('/', authRoutes);
app.use('/admin', requireAuth, requireRole('admin'), adminRoutes);
app.use('/cliente', requireAuth, requireRole('client'), clientRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('auth/error', { message: 'Página não encontrada', code: 404 });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('auth/error', { message: err.message || 'Erro interno', code: 500 });
});

app.listen(PORT, () => {
  console.log(`\n🔥 VS TEAM APP rodando em http://localhost:${PORT}`);
  console.log(`   Admin:   victor@vsteam.com / vsteam2026`);
  console.log(`   Cliente: joao@cliente.com / cliente123\n`);
});
