/* Progressive enhancement: content never depends on motion or JavaScript. */
(function () {
  'use strict';
  var preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  var route = document.querySelector('.track-list');
  var surfaces = document.querySelectorAll('header.site, .signal-hero, .workflow-band, .control-grid, .close-band, footer.site');
  if (!('IntersectionObserver' in window)) return;

  var visible = new WeakMap();
  function rest(surface) {
    surface.classList.toggle('motion-rest', document.hidden || !visible.get(surface));
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      visible.set(entry.target, entry.isIntersecting);
      rest(entry.target);
    });
  });
  surfaces.forEach(function (surface) { observer.observe(surface); });
  document.addEventListener('visibilitychange', function () {
    surfaces.forEach(rest);
  });

  if (!route) return;
  var arrival = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      if (!preference.matches) route.classList.add('route-arrived');
      arrival.unobserve(route);
    });
  }, { threshold: 0.1 });
  arrival.observe(route);
  preference.addEventListener('change', function () {
    if (preference.matches) route.classList.remove('route-arrived');
  });
}());
