// helpers/notifications.js — render de variáveis + processador de campanhas agendadas
const db = require('../database');

const DESTINOS = [
  { value: '/cliente',            label: 'Dashboard' },
  { value: '/cliente/urgentes',   label: 'Urgentes (lista)' },
  { value: '/cliente/treinar',    label: 'Treinar' },
  { value: '/cliente/avaliacao',  label: 'Avaliação Semanal' },
  { value: '/cliente/antes-depois', label: 'Antes x Depois' },
  { value: '/cliente/progressao', label: 'Minha Progressão' },
  { value: '/cliente/feedbacks',  label: 'Feedbacks' },
  { value: '/cliente/gym-cats',   label: 'Gym Cats' },
  { value: '/cliente/questionario', label: 'Questionário' },
  { value: '/cliente/perfil',     label: 'Meu Perfil' },
];

const VARIAVEIS_DOC = [
  { token: '{nome}',          desc: 'Primeiro nome do aluno' },
  { token: '{nome_completo}', desc: 'Nome completo' },
  { token: '{semana}',        desc: 'Semana operacional atual' },
  { token: '{dia}',           desc: 'Dia de hoje (dd/mm/yyyy)' },
  { token: '{dia_semana}',    desc: 'Dia da semana (segunda, terça…)' },
];

const DIAS_SEMANA = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

function firstName(full) {
  return (full || '').trim().split(/\s+/)[0] || '';
}

function getOperationalWeek() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='operational_week'").get();
    return row ? row.value : '1';
  } catch(e) { return '1'; }
}

function renderTemplate(str, client) {
  if (!str) return '';
  const now = new Date();
  const dias = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const dia = String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
  return String(str)
    .replace(/\{nome_completo\}/g, client.name || '')
    .replace(/\{nome\}/g, firstName(client.name))
    .replace(/\{semana\}/g, getOperationalWeek())
    .replace(/\{dia_semana\}/g, dias[now.getDay()])
    .replace(/\{dia\}/g, dia);
}

// Formata Date -> "YYYY-MM-DD HH:MM:SS" (local time)
function fmtDb(d) {
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '
       + pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}

// Calcula a próxima data/hora pra uma campanha recorrente.
// Sempre retorna um instante NO FUTURO em relação a "now".
function computeNextRun(camp, now) {
  now = now || new Date();
  const [hh, mm] = String(camp.recurrence_time || '09:00').split(':').map(x => parseInt(x) || 0);

  if (camp.recurrence_type === 'daily') {
    const next = new Date(now);
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return fmtDb(next);
  }

  if (camp.recurrence_type === 'weekly') {
    const targetDow = parseInt(camp.recurrence_day);
    const next = new Date(now);
    next.setHours(hh, mm, 0, 0);
    let diff = (targetDow - next.getDay() + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setDate(next.getDate() + diff);
    return fmtDb(next);
  }

  if (camp.recurrence_type === 'monthly') {
    const targetDom = Math.max(1, Math.min(28, parseInt(camp.recurrence_day) || 1));
    const next = new Date(now);
    next.setDate(targetDom);
    next.setHours(hh, mm, 0, 0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDom);
    }
    return fmtDb(next);
  }

  return null;
}

// Descrição humana da recorrência (pra mostrar na lista de campanhas)
function describeSchedule(camp) {
  const t = camp.recurrence_time || '09:00';
  if (camp.recurrence_type === 'daily')   return `🔁 Diariamente às ${t}`;
  if (camp.recurrence_type === 'weekly')  {
    const d = DIAS_SEMANA.find(x => x.value === camp.recurrence_day);
    return `🔁 Toda ${d ? d.label.toLowerCase() : '?'} às ${t}`;
  }
  if (camp.recurrence_type === 'monthly') return `🔁 Todo dia ${camp.recurrence_day} às ${t}`;
  return `📅 ${camp.scheduled_for}`;
}

// "Agora" como string YYYY-MM-DD HH:MM:SS no fuso do servidor (que setamos pra America/Sao_Paulo).
// Importante: SQLite datetime('now','localtime') depende do TZ da libc, e em alguns ambientes
// (Railway/Nixpacks) isso pode quebrar. Aqui geramos via Node, que respeita process.env.TZ.
function nowLocalString() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '
       + pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}

// Processa todas as campanhas pendentes cujo scheduled_for já passou.
// Para campanhas 'once' → marca como sent. Para recorrentes → recalcula próxima data.
function processPendingCampaigns() {
  try {
    const agora = nowLocalString();
    const pendentes = db.prepare(`
      SELECT * FROM notification_campaigns
      WHERE status = 'pending' AND scheduled_for <= ?
    `).all(agora);

    if (pendentes.length === 0) return 0;

    const getRecipients = db.prepare(`
      SELECT c.id as client_id, u.name
      FROM notification_campaign_recipients r
      JOIN clients c ON c.id = r.client_id
      JOIN users u ON u.id = c.user_id
      WHERE r.campaign_id = ?
    `);
    const insertNotif = db.prepare(`
      INSERT INTO notifications (client_id, campaign_id, title, body, redirect_to)
      VALUES (?, ?, ?, ?, ?)
    `);
    const markSent = db.prepare(`
      UPDATE notification_campaigns SET status='sent', sent_at=datetime('now') WHERE id=?
    `);
    const rescheduleRecurring = db.prepare(`
      UPDATE notification_campaigns SET scheduled_for=?, sent_at=datetime('now') WHERE id=?
    `);

    let total = 0;
    for (const camp of pendentes) {
      const isRecurring = camp.recurrence_type && camp.recurrence_type !== 'once';
      const tx = db.transaction((c) => {
        const recipients = getRecipients.all(c.id);
        for (const r of recipients) {
          const t = renderTemplate(c.title_snapshot, r);
          const b = renderTemplate(c.body_snapshot, r);
          insertNotif.run(r.client_id, c.id, t, b, c.redirect_to || '/cliente');
          total++;
        }
        if (isRecurring) {
          const next = computeNextRun(c);
          rescheduleRecurring.run(next, c.id);
        } else {
          markSent.run(c.id);
        }
      });
      tx(camp);
      if (isRecurring) {
        console.log(`🔁 Disparo recorrente "${camp.name}" enviado pra ${camp.total_recipients} aluno(s). Próximo: ${computeNextRun(camp)}`);
      } else {
        console.log(`📨 Disparo "${camp.name}" enviado pra ${camp.total_recipients} aluno(s).`);
      }
    }
    return total;
  } catch(e) {
    console.error('[scheduler]', e.message);
    return 0;
  }
}

function unreadCount(clientId) {
  try {
    const row = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE client_id=? AND read_at IS NULL").get(clientId);
    return row ? row.c : 0;
  } catch(e) { return 0; }
}

module.exports = {
  DESTINOS,
  VARIAVEIS_DOC,
  DIAS_SEMANA,
  renderTemplate,
  processPendingCampaigns,
  computeNextRun,
  describeSchedule,
  unreadCount,
  nowLocalString,
};
