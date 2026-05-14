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

// Processa todas as campanhas pendentes cujo scheduled_for já passou.
// Idempotente: usa transação por campanha e marca como 'sent' ao final.
function processPendingCampaigns() {
  try {
    const pendentes = db.prepare(`
      SELECT * FROM notification_campaigns
      WHERE status = 'pending' AND scheduled_for <= datetime('now', 'localtime')
    `).all();

    if (pendentes.length === 0) return 0;

    const getRecipients = db.prepare(`
      SELECT c.id as client_id, c.name
      FROM notification_campaign_recipients r
      JOIN clients c ON c.id = r.client_id
      WHERE r.campaign_id = ?
    `);
    const insertNotif = db.prepare(`
      INSERT INTO notifications (client_id, campaign_id, title, body, redirect_to)
      VALUES (?, ?, ?, ?, ?)
    `);
    const markSent = db.prepare(`
      UPDATE notification_campaigns SET status='sent', sent_at=datetime('now') WHERE id=?
    `);

    let total = 0;
    for (const camp of pendentes) {
      const tx = db.transaction((c) => {
        const recipients = getRecipients.all(c.id);
        for (const r of recipients) {
          const t = renderTemplate(c.title_snapshot, r);
          const b = renderTemplate(c.body_snapshot, r);
          insertNotif.run(r.client_id, c.id, t, b, c.redirect_to || '/cliente');
          total++;
        }
        markSent.run(c.id);
      });
      tx(camp);
      console.log(`📨 Disparo "${camp.name}" enviado para ${camp.total_recipients} aluno(s).`);
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
  renderTemplate,
  processPendingCampaigns,
  unreadCount,
};
