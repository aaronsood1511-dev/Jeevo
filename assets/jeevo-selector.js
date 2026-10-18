document.addEventListener('DOMContentLoaded', () => {
  const track = document.querySelector('.jv-selector-wrapper');
  if (!track) return;
  const cards = [...track.querySelectorAll('.jv-selector-item')];
  const region = document.querySelector('#journey-region');
  const controls = document.querySelector('.jv-slider-controls');
  const prev = controls.querySelector('.jv-slider-prev');
  const next = controls.querySelector('.jv-slider-next');
  const count = controls.querySelector('.jv-slider-count');
  const desktop = matchMedia('(min-width:1025px)');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  let page = 0, filtered = cards, visible = [];
  function activate(card) {
    visible.forEach(item => {
      const active = item === card;
      item.classList.toggle('active', active);
      item.querySelector('.jv-panel-toggle').setAttribute('aria-expanded', String(active));
    });
  }
  function render() {
    filtered = cards.filter(c => region.value === 'all' || c.dataset.regions.split(' ').includes(region.value));
    visible = filtered.slice(page * 4, page * 4 + 4);
    cards.forEach(c => { c.hidden = !visible.includes(c); });
    activate(visible[0]);
    track.scrollLeft = 0;
    prev.disabled = page === 0;
    next.disabled = (page + 1) * 4 >= filtered.length;
    count.textContent = `${page * 4 + 1}–${Math.min((page + 1) * 4, filtered.length)} / ${filtered.length}`;
  }
  track.classList.add('is-enhanced'); controls.hidden = false;
  cards.forEach((card, i) => {
    const toggle = card.querySelector('.jv-panel-toggle');
    const info = card.querySelector('.jv-selector-info');
    info.id = `journey-details-${i}`;
    toggle.setAttribute('aria-controls', info.id);
    toggle.addEventListener('click', () => activate(card));
    toggle.addEventListener('focus', () => activate(card));
    toggle.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault(); let index = visible.indexOf(card);
      index = e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
      visible[index].querySelector('.jv-panel-toggle').focus();
    });
  });
  region.addEventListener('change', () => {page = 0; render();});
  prev.addEventListener('click', () => {page--; render(); if(prev.disabled) next.focus();});
  next.addEventListener('click', () => {page++; render(); if(next.disabled) prev.focus();});
  document.querySelectorAll('[data-region]').forEach(link => link.addEventListener('click', e => {
    e.preventDefault(); region.value = link.dataset.region; page = 0; render();
    document.querySelector('#interactive-tours').scrollIntoView({behavior:reduced.matches ? 'instant' : 'smooth'});
    region.focus({preventScroll:true});
    history.replaceState(null, '', '#interactive-tours');
  }));
  function hint(){controls.querySelector('.jv-slider-hint').textContent = desktop.matches ? 'Select a photograph to discover more.' : 'Swipe to explore. Arrows show more journeys.';}
  desktop.addEventListener('change', hint); hint(); render();
});
