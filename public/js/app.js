// VS TEAM — JS global
document.addEventListener('DOMContentLoaded', () => {
  // Auto-hide flash messages after 5s
  document.querySelectorAll('.alert').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 5000);
  });

  // Confirma deletar
  document.querySelectorAll('form[data-confirm]').forEach(f => {
    f.addEventListener('submit', (e) => {
      if (!confirm(f.dataset.confirm)) e.preventDefault();
    });
  });

  // Toggle tab sections (admin client-detail)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.dataset.target;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(target)?.classList.add('active');
    });
  });

  // Mobile menu toggle
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
});


// ============ TEMA CLARO/ESCURO ============
(function(){
  const saved = localStorage.getItem('vsteam_theme');
  if (saved === 'light') document.body.classList.add('theme-light');
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('theme-light');
        localStorage.setItem('vsteam_theme',
          document.body.classList.contains('theme-light') ? 'light' : 'dark');
      });
    }
  });
})();

// ============ LISTA: BUSCA + FILTRO + VIEW TOGGLE + SELEÇÃO MULTIPLA ============
document.addEventListener('DOMContentLoaded', () => {
  // Busca em tempo real
  document.querySelectorAll('[data-search-target]').forEach(input => {
    const targetSelector = input.dataset.searchTarget;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      document.querySelectorAll(targetSelector).forEach(el => {
        const text = (el.dataset.searchText || el.textContent).toLowerCase();
        el.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });
  });

  // Filtro por status
  document.querySelectorAll('[data-filter-target]').forEach(sel => {
    const targetSelector = sel.dataset.filterTarget;
    sel.addEventListener('change', () => {
      const v = sel.value;
      document.querySelectorAll(targetSelector).forEach(el => {
        if (!v) { el.style.display = ''; return; }
        const tags = (el.dataset.filter || '').split(',');
        el.style.display = tags.includes(v) ? '' : 'none';
      });
    });
  });

  // Toggle de view (cards/lista)
  document.querySelectorAll('.view-toggle').forEach(toggle => {
    toggle.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset.view;
        toggle.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const wrap = toggle.closest('[data-view-wrap]');
        if (wrap) {
          wrap.querySelectorAll('.cards-view, .list-view').forEach(el => el.classList.remove('active'));
          wrap.querySelector('.' + v + '-view')?.classList.add('active');
          localStorage.setItem('vsteam_listview', v);
        }
      });
    });
    // Restaurar preferência
    const saved = localStorage.getItem('vsteam_listview');
    if (saved) toggle.querySelector('button[data-view="' + saved + '"]')?.click();
  });

  // Seleção múltipla
  document.querySelectorAll('[data-bulk-form]').forEach(form => {
    const checkboxes = form.querySelectorAll('input[type="checkbox"][name="ids"]');
    const bar = document.querySelector(form.dataset.bulkForm);
    const count = bar?.querySelector('.count');
    function update() {
      const sel = Array.from(checkboxes).filter(c => c.checked);
      if (count) count.textContent = sel.length;
      if (bar) bar.classList.toggle('visible', sel.length > 0);
    }
    checkboxes.forEach(c => c.addEventListener('change', update));
    const all = form.querySelector('input[data-check-all]');
    if (all) all.addEventListener('change', () => {
      checkboxes.forEach(c => c.checked = all.checked);
      update();
    });
  });
});
