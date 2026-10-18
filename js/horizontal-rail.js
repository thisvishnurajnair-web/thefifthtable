const rails = new WeakMap();

// Native scrolling keeps touch, trackpad and keyboard navigation available.
export function enhanceRail(track, label) {
  if (rails.has(track)) {
    rails.get(track)();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'horizontal-rail';
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', label);
  track.before(wrapper);
  wrapper.append(track);
  track.tabIndex = 0;
  track.setAttribute('aria-label', `${label}. Use the left and right arrow keys to browse.`);

  const controls = document.createElement('div');
  controls.className = 'rail-controls';
  controls.innerHTML = `<span class="rail-position"></span><div class="rail-buttons"><button type="button" data-direction="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg></button><button type="button" data-direction="1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button></div>`;
  wrapper.append(controls);
  const [previous, next] = controls.querySelectorAll('button');
  previous.setAttribute('aria-label', `Previous ${label.toLowerCase()}`);
  next.setAttribute('aria-label', `Next ${label.toLowerCase()}`);
  const position = controls.querySelector('.rail-position');
  let active = 0;
  let frame;

  function items() { return [...track.children]; }
  function left(item) {
    return item.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
  }
  function update() {
    const cards = items();
    wrapper.hidden = !cards.length;
    const overflow = track.scrollWidth > track.clientWidth + 2;
    controls.hidden = !overflow;
    if (!cards.length) return;
    active = cards.reduce((nearest, card, index) =>
      Math.abs(left(card) - track.scrollLeft) < Math.abs(left(cards[nearest]) - track.scrollLeft) ? index : nearest, 0);
    const atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    previous.disabled = !overflow || track.scrollLeft <= left(cards[0]) + 2;
    next.disabled = !overflow || atEnd;
    const visible = cards.map((card, index) => ({ index, start: left(card), end: left(card) + card.getBoundingClientRect().width }))
      .filter(card => card.start >= track.scrollLeft - 2 && card.end <= track.scrollLeft + track.clientWidth + 2);
    const first = visible[0]?.index ?? active;
    const last = visible.at(-1)?.index ?? active;
    position.textContent = `${String(first + 1).padStart(2, '0')}${last > first ? '–' + String(last + 1).padStart(2, '0') : ''} / ${String(cards.length).padStart(2, '0')}`;
    position.setAttribute('aria-label', `Showing ${first + 1}${last > first ? ' to ' + (last + 1) : ''} of ${cards.length}`);
  }
  function move(index) {
    const cards = items();
    const card = cards[Math.max(0, Math.min(cards.length - 1, index))];
    if (card) track.scrollTo({ left: left(card), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  previous.addEventListener('click', () => move(active - 1));
  next.addEventListener('click', () => move(active + 1));
  track.addEventListener('keydown', event => {
    if (event.target !== track) return;
    const target = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: items().length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); move(target); }
  });
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }, { passive: true });
  new ResizeObserver(update).observe(track);
  rails.set(track, update);
  update();
}

document.querySelectorAll('.category-directory-list').forEach(track => enhanceRail(track, 'Equipment categories'));
