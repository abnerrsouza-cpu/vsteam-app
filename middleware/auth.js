function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Faça login para acessar.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== role) {
      return res.status(403).render('auth/error', {
        message: 'Você não tem acesso a esta área.',
        code: 403
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
