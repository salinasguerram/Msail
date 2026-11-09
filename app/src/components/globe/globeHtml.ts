/**
 * Página HTML del planeta 3D (globe.gl sobre WebGL). La usan el WebView (iOS y Android) y el iframe (web).
 *
 * Comunicación:
 * - La app manda mensajes con window.msail.receive(msg) (WebView) o postMessage (iframe): ver ToGlobe en types.ts.
 * - El planeta contesta con ReactNativeWebView.postMessage (WebView) o window.parent.postMessage (iframe): ver FromGlobe.
 *
 * Capas:
 * - Países (Natural Earth 1:110m): bordes suaves; el país tocado se resalta y la cámara se acerca según su tamaño.
 * - Pines (HTML) con ícono por tipo; con zoom cercano muestran un mini resumen.
 * - Viento: líneas animadas que salen en la dirección hacia donde sopla, con color según la intensidad.
 *
 * Librería, texturas y países desde jsDelivr con versión fija. Texturas de la NASA (Blue Marble, dominio público).
 */

const GLOBE_GL = 'https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js';
const THREE_GLOBE = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.6/example';

export const POINT_COLORS = {
  event: '#f5c542',
  live: '#e63946',
  marina: '#2f8cff',
  professional: '#2ecc71',
} as const;

/** Escala de color del viento (nudos): igual en el planeta y en la leyenda de la app. */
export const WIND_SCALE = [
  { knots: 0, color: '#3b82f6' },
  { knots: 10, color: '#22c55e' },
  { knots: 18, color: '#facc15' },
  { knots: 26, color: '#f97316' },
  { knots: 34, color: '#ef4444' },
] as const;

/** Con la cámara más cerca que esto, los pines muestran su mini resumen. */
const NEAR_ALTITUDE = 0.9;

// Íconos (SVG simples, 24x24): velero, ancla y llave.
const ICONS = {
  event: '<path d="M12 3v14M12 4l6 11h-6M11 6L5 15h6M4 18h16l-2 3H6z"/>',
  marina: '<circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M5 15a7 7 0 0 0 14 0"/>',
  professional: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
};

export function globeHtml({ background, language }: { background: string; language: string }) {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: ${background}; font-family: -apple-system, system-ui, sans-serif; }
  #globe { position: absolute; inset: 0; cursor: grab; }
  #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #7f8fab; font-size: 14px; }
  .pin { position: relative; transform: translate(-50%, -100%); cursor: pointer; transition: opacity .25s; }
  .pin .dot { width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
    display: flex; align-items: center; justify-content: center; border: 2px solid #fff;
    box-shadow: 0 0 0 4px rgba(255,255,255,.12), 0 4px 12px rgba(0,0,0,.5); }
  .pin svg { transform: rotate(45deg); width: 16px; height: 16px; fill: none; stroke: #050b18; stroke-width: 2.2;
    stroke-linecap: round; stroke-linejoin: round; }
  .pin.live .dot { animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100% { box-shadow: 0 0 0 4px rgba(230,57,70,.35); } 50% { box-shadow: 0 0 0 10px rgba(230,57,70,0); } }
  .pin .card { display: none; position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); width: 190px;
    background: rgba(11,23,48,.96); border: 1px solid #1c2c4d; border-radius: 10px; padding: 8px 10px;
    color: #e6edf7; font-size: 12px; line-height: 1.35; box-shadow: 0 8px 24px rgba(0,0,0,.5); pointer-events: none; }
  .pin .card b { display: block; font-size: 13px; margin-bottom: 2px; }
  .pin .card em { display: block; font-style: normal; font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; margin-bottom: 3px; }
  .pin .card span { color: #9fb0cc; }
  body.near .pin .card, .pin.open .card, .pin:hover .card { display: block; }
  body.wind .pin { opacity: .75; }
</style>
</head>
<body>
<div id="loading">…</div>
<div id="globe"></div>
<script src="${GLOBE_GL}"></script>
<script>
(function () {
  var COLORS = ${JSON.stringify(POINT_COLORS)};
  var WIND_SCALE = ${JSON.stringify(WIND_SCALE)};
  var ICONS = ${JSON.stringify(ICONS)};
  var LANG = ${JSON.stringify(language)};
  var NEAR = ${NEAR_ALTITUDE};
  var native = !!window.ReactNativeWebView;

  function send(msg) {
    if (native) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else window.parent.postMessage({ source: 'msail-globe', msg: msg }, '*');
  }

  if (typeof Globe !== 'function') {
    document.getElementById('loading').textContent = 'No se pudo cargar el planeta. Revisá la conexión.';
    send({ type: 'error', message: 'globe.gl no cargó' });
    return;
  }

  var el = document.getElementById('globe');
  var points = [];
  var layers = { event: true, marina: true, professional: true };
  var openPinId = null;
  var countries = [];
  var selectedCountry = null;
  var lastTap = 0;

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames([LANG], { type: 'region' }); } catch (e) { regionNames = null; }

  function isoOf(f) {
    var p = f.properties;
    if (p.ISO_A2 && p.ISO_A2.length === 2) return p.ISO_A2;
    if (p.WB_A2 && p.WB_A2.length === 2) return p.WB_A2;
    return null;
  }
  function countryName(f) {
    var iso = isoOf(f);
    try { if (iso && regionNames) return regionNames.of(iso); } catch (e) {}
    return f.properties.NAME;
  }

  function tap(lat, lng, pointId) {
    var now = Date.now();
    if (now - lastTap < 250) return; // un solo toque aunque lo reciban dos capas
    lastTap = now;
    send({ type: 'tap', lat: lat, lng: lng, pointId: pointId || null });
  }

  var globe = Globe()(el)
    .backgroundColor('${background}')
    .globeImageUrl('${THREE_GLOBE}/img/earth-blue-marble.jpg')
    .bumpImageUrl('${THREE_GLOBE}/img/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereColor('#2f8cff')
    .atmosphereAltitude(0.18)
    // Países
    .polygonCapColor(function (f) { return f === selectedCountry ? 'rgba(47,140,255,0.30)' : 'rgba(0,0,0,0)'; })
    .polygonSideColor(function () { return 'rgba(0,0,0,0)'; })
    .polygonStrokeColor(function (f) { return f === selectedCountry ? '#9cc8ff' : 'rgba(255,255,255,0.14)'; })
    .polygonAltitude(function (f) { return f === selectedCountry ? 0.012 : 0.004; })
    .polygonsTransitionDuration(350)
    .onPolygonClick(function (f, ev, c) { if (c) tap(c.lat, c.lng, null); })
    .onGlobeClick(function (c) { tap(c.lat, c.lng, null); })
    // Pines
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.01)
    .htmlTransitionDuration(0)
    .htmlElement(pinElement)
    // Anillo en el lugar tocado
    .ringColor(function () { return function (t) { return 'rgba(156,200,255,' + (1 - t) + ')'; }; })
    .ringMaxRadius(3)
    .ringPropagationSpeed(2)
    .ringRepeatPeriod(1100)
    // Viento
    .arcStartLat('lat').arcStartLng('lng').arcEndLat('endLat').arcEndLng('endLng')
    .arcColor('colors')
    .arcAltitude(0.003)
    .arcStroke(0.6)
    .arcDashLength(0.45)
    .arcDashGap(0.55)
    .arcDashInitialGap(function (d) { return d.gap; })
    .arcDashAnimateTime(1800)
    .arcsTransitionDuration(0);

  // Los pines del otro lado del planeta se ocultan.
  if (typeof globe.htmlElementVisibilityModifier === 'function') {
    globe.htmlElementVisibilityModifier(function (node, visible) {
      node.style.opacity = visible ? '' : '0';
      node.style.pointerEvents = visible ? 'auto' : 'none';
    });
  }

  function pinElement(p) {
    var node = document.createElement('div');
    var color = p.live ? COLORS.live : COLORS[p.kind];
    node.className = 'pin' + (p.live ? ' live' : '') + (p.id === openPinId ? ' open' : '');
    node.style.pointerEvents = 'auto';
    node.innerHTML =
      '<div class="dot" style="background:' + color + '"><svg viewBox="0 0 24 24">' + ICONS[p.kind] + '</svg></div>' +
      '<div class="card"><em style="color:' + color + '">' + esc(p.typeLabel || '') + '</em><b>' + esc(p.name) + '</b>' +
      '<span>' + esc(p.summary || p.subtitle || '') + '</span></div>';
    node.addEventListener('click', function (ev) { ev.stopPropagation(); tap(p.lat, p.lng, p.id); });
    return node;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Gira solo hasta que la persona lo toca. Con zoom cercano, los pines muestran su resumen.
  var controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.addEventListener('start', function () { controls.autoRotate = false; });
  globe.onZoom(function (pov) { document.body.classList.toggle('near', pov.altitude < NEAR); });
  globe.pointOfView({ lat: 20, lng: -30, altitude: 2.3 });

  function fit() { globe.width(window.innerWidth).height(window.innerHeight); }
  window.addEventListener('resize', fit);
  fit();

  function drawPins() {
    globe.htmlElementsData(points.filter(function (p) { return layers[p.kind]; }));
  }
  function refreshCountries() {
    globe.polygonsData(countries.slice());
  }

  // ---------- País que contiene un punto (polígonos GeoJSON, rayos)
  function inRing(lng, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(lng, lat, rings) {
    if (!inRing(lng, lat, rings[0])) return false;
    for (var k = 1; k < rings.length; k++) if (inRing(lng, lat, rings[k])) return false; // agujeros
    return true;
  }
  function countryAt(lat, lng) {
    for (var i = 0; i < countries.length; i++) {
      var g = countries[i].geometry;
      var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (var k = 0; k < polys.length; k++) if (inPolygon(lng, lat, polys[k])) return countries[i];
    }
    return null;
  }
  // Tamaño del país (el polígono más grande) para decidir cuánto acercar la cámara.
  function spanOf(f) {
    var g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, best = 0;
    polys.forEach(function (rings) {
      var minX = 180, maxX = -180, minY = 90, maxY = -90;
      rings[0].forEach(function (c) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
      best = Math.max(best, maxX - minX, maxY - minY);
    });
    return best;
  }

  // ---------- Viento
  function windColor(knots, alpha) {
    var s = WIND_SCALE, i = 0;
    while (i < s.length - 1 && knots >= s[i + 1].knots) i++;
    var hex = s[i].color.replace('#', '');
    var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  // Punto de destino desde (lat, lng) con rumbo y distancia en grados de arco.
  function destination(lat, lng, bearing, deg) {
    var R = Math.PI / 180, d = deg * R, b = bearing * R, p1 = lat * R, l1 = lng * R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [p2 / R, ((l2 / R + 540) % 360) - 180];
  }
  function drawWind(cells) {
    document.body.classList.toggle('wind', !!cells);
    if (!cells) { globe.arcsData([]); return; }
    var arcs = [];
    cells.forEach(function (c) {
      if (c.speed == null || c.direction == null) return;
      // Varias líneas por celda, un poco corridas, para que se vea como un campo de viento.
      [[0, 0], [5, 5], [-5, 5], [5, -5], [-5, -5]].forEach(function (o, n) {
        var lat = c.lat + o[0], lng = c.lng + o[1];
        if (lat > 80 || lat < -75) return;
        var end = destination(lat, lng, (c.direction + 180) % 360, Math.min(2 + c.speed * 0.3, 10));
        arcs.push({ lat: lat, lng: lng, endLat: end[0], endLng: end[1],
          colors: [windColor(c.speed, 0.05), windColor(c.speed, 0.95)], gap: ((n * 0.37 + c.lng / 97) % 1 + 1) % 1 });
      });
    });
    globe.arcsData(arcs);
  }

  // ---------- Mensajes de la app
  function select(msg) {
    controls.autoRotate = false;
    openPinId = msg.pointId || null;
    selectedCountry = countryAt(msg.lat, msg.lng) ||
      (msg.iso ? countries.filter(function (f) { return isoOf(f) === msg.iso; })[0] || null : null);
    refreshCountries();
    drawPins();
    globe.ringsData([{ lat: msg.lat, lng: msg.lng }]);
    var altitude = msg.pointId ? 0.4 : selectedCountry ? Math.max(0.35, Math.min(1.4, spanOf(selectedCountry) / 40)) : 0.9;
    globe.pointOfView({ lat: msg.lat, lng: msg.lng, altitude: altitude }, 1000);
    send({ type: 'country', name: selectedCountry ? countryName(selectedCountry) : null, iso: selectedCountry ? isoOf(selectedCountry) : null });
  }

  function receive(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'points') {
      points = msg.points || [];
      layers = msg.layers || layers;
      drawPins();
    } else if (msg.type === 'select') {
      select(msg);
    } else if (msg.type === 'clear') {
      openPinId = null;
      selectedCountry = null;
      globe.ringsData([]);
      refreshCountries();
      drawPins();
    } else if (msg.type === 'wind') {
      drawWind(msg.cells);
    }
  }

  window.msail = { receive: receive };
  window.addEventListener('message', function (e) {
    var data = e.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (err) { return; } }
    if (data && data.target === 'msail-globe') receive(data.msg);
  });

  fetch('${THREE_GLOBE}/country-polygons/ne_110m_admin_0_countries.geojson')
    .then(function (r) { return r.json(); })
    .then(function (geo) {
      countries = geo.features.filter(function (f) { return f.properties.ISO_A2 !== 'AQ'; });
      refreshCountries();
    })
    .catch(function () { /* sin países se puede usar igual */ });

  globe.onGlobeReady(function () {
    document.getElementById('loading').style.display = 'none';
    send({ type: 'ready' });
  });
})();
</script>
</body>
</html>`;
}
