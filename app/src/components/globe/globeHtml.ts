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

import { SEAS } from './seas';

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

/** Con la cámara más cerca que esto, los pines muestran su nombre. */
const NEAR_ALTITUDE = 0.9;
/** Más lejos que esto, los pines que se pisan se juntan en uno con el número; más cerca, se apilan. */
const CLUSTER_ALTITUDE = 1.0;

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
  .pin .leader { position: absolute; left: 50%; top: 30px; width: 2px; margin-left: -1px; background: rgba(255,255,255,.55); }
  .pin .label { display: none; position: absolute; left: 30px; top: 3px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; background: rgba(5,11,24,.88); border: 1px solid #1c2c4d; border-radius: 6px; padding: 2px 7px;
    color: #e6edf7; font-size: 11px; font-weight: 600; pointer-events: none; }
  body.near .pin .label, .pin.stacked .label { display: block; }
  .pin .card { display: none; position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); width: 190px; z-index: 2;
    background: rgba(11,23,48,.96); border: 1px solid #1c2c4d; border-radius: 10px; padding: 8px 10px;
    color: #e6edf7; font-size: 12px; line-height: 1.35; box-shadow: 0 8px 24px rgba(0,0,0,.5); pointer-events: none; }
  .pin .card b { display: block; font-size: 13px; margin-bottom: 2px; }
  .pin .card em { display: block; font-style: normal; font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; margin-bottom: 3px; }
  .pin .card span { color: #9fb0cc; }
  .pin.open .card, .pin:hover .card { display: block; }
  .pin.open .label, .pin:hover .label { display: none; }
  .pin:hover, .pin.open { z-index: 10; }
  .country-label { transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap; color: #fff;
    font-size: 15px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; padding: 4px 12px; border-radius: 999px;
    background: rgba(5,11,24,.55); border: 1px solid rgba(156,200,255,.55); box-shadow: 0 4px 16px rgba(0,0,0,.45);
    text-shadow: 0 1px 6px rgba(0,0,0,.9); transition: opacity .25s; }
  .country-label.below { transform: translate(-50%, 14px); font-size: 13px; }
  .sea { transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap; font-style: italic;
    color: rgba(170,205,255,.78); text-shadow: 0 1px 4px rgba(0,0,0,.85); letter-spacing: 1.5px; transition: opacity .25s; }
  .sea.t1 { font-size: 15px; letter-spacing: 4px; text-transform: uppercase; color: rgba(170,205,255,.6); }
  .sea.t2 { font-size: 12px; display: none; }
  .sea.t3 { font-size: 11px; display: none; }
  body.z2 .sea.t2, body.z3 .sea.t2, body.z3 .sea.t3 { display: block; }
  /* Se mueven en la placa de video en lugar de redibujarse en cada cuadro. */
  .pin, .sea, .cluster, .country-label { will-change: transform, opacity; }
  .cluster { transform: translate(-50%, -50%); width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: #050b18; font-weight: 800; font-size: 14px;
    border: 2px solid #fff; box-shadow: 0 0 0 5px rgba(255,255,255,.14), 0 4px 12px rgba(0,0,0,.5); transition: opacity .25s; }
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
  // Mares y océanos en el idioma de la app.
  var SEAS = ${JSON.stringify(SEAS)}.map(function (s) {
    return { name: String(LANG).indexOf('en') === 0 ? s.en : s.es, lat: s.lat, lng: s.lng, tier: s.tier };
  });
  // Hasta qué altura de la cámara se muestra cada nivel (1: océanos, 2: mares, 3: mares chicos).
  var SEA_MAX_ALTITUDE = { 1: 99, 2: 1.6, 3: 0.55 };
  var NEAR = ${NEAR_ALTITUDE};
  // Duración de los cambios de vista (Explorar y volver al inicio): larga y con aceleración suave.
  var TRANSITION_MS = 1400;
  var CLUSTER = ${CLUSTER_ALTITUDE};
  var STACK = 40; // separación vertical entre pines apilados (px)
  var OVERLAP = 34; // dos pines a menos de esto (px en pantalla) se pisan
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
  var selectedCenter = null;
  var labelBelow = false;

  // Mar u océano de un punto en el agua: el nombre más cercano, pesando más los mares (más precisos que los océanos).
  function seaAt(lat, lng) {
    var best = null, bestScore = Infinity;
    SEAS.forEach(function (s) {
      var angle = angleBetween(lat, lng, s.lat, s.lng);
      var reach = s.tier === 1 ? 60 : s.tier === 2 ? 14 : 5; // hasta dónde llega cada uno (grados)
      if (angle > reach) return;
      var score = angle / reach;
      if (score < bestScore) { bestScore = score; best = s.name; }
    });
    return best;
  }

  function angleBetween(lat1, lng1, lat2, lng2) {
    var R = Math.PI / 180;
    var c = Math.sin(lat1 * R) * Math.sin(lat2 * R) + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.cos((lng1 - lng2) * R);
    return Math.acos(Math.max(-1, Math.min(1, c))) / R;
  }
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
    .htmlElement(function (d) {
      if (d.type === 'country') return countryElement(d);
      if (d.type === 'sea') return seaElement(d);
      return d.type === 'cluster' ? clusterElement(d) : pinElement(d);
    })
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

  // Rendimiento: en pantallas de alta densidad (2x, 3x) se dibuja a 1,5x como máximo. Se ve igual y,
  // como el lienzo cubre toda la pantalla, son hasta 4 veces menos píxeles por cuadro.
  try { globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); } catch (e) {}

  // Los pines del otro lado del planeta se ocultan.
  if (typeof globe.htmlElementVisibilityModifier === 'function') {
    globe.htmlElementVisibilityModifier(function (node, visible) {
      node.style.opacity = visible ? '' : '0';
      node.style.pointerEvents = visible ? 'auto' : 'none';
    });
  }

  // Pin de un punto. En una pila, el pin k va k * STACK px más arriba, con una línea hasta el lugar real.
  function pinElement(d) {
    var p = d.point;
    var node = document.createElement('div');
    var color = p.live ? COLORS.live : COLORS[p.kind];
    node.className = 'pin' + (p.live ? ' live' : '') + (p.id === openPinId ? ' open' : '') + (d.size > 1 ? ' stacked' : '');
    node.style.pointerEvents = 'auto';
    if (d.stack) node.style.marginTop = (-d.stack * STACK) + 'px';
    node.innerHTML =
      (d.stack ? '<div class="leader" style="height:' + (d.stack * STACK) + 'px"></div>' : '') +
      '<div class="dot" style="background:' + color + '"><svg viewBox="0 0 24 24">' + ICONS[p.kind] + '</svg></div>' +
      '<div class="label">' + esc(p.name) + '</div>' +
      '<div class="card"><em style="color:' + color + '">' + esc(p.typeLabel || '') + '</em><b>' + esc(p.name) + '</b>' +
      '<span>' + esc(p.summary || p.subtitle || '') + '</span></div>';
    node.addEventListener('click', function (ev) { ev.stopPropagation(); tap(p.lat, p.lng, p.id); });
    return node;
  }

  function seaElement(d) {
    var node = document.createElement('div');
    node.className = 'sea t' + d.tier;
    node.textContent = d.name;
    return node;
  }

  // Nombre del país elegido, en el idioma de la app, sobre el centro del país.
  function countryElement(d) {
    var node = document.createElement('div');
    node.className = 'country-label' + (d.below ? ' below' : '');
    node.textContent = d.name;
    return node;
  }

  // Grupo de pines que se pisan (de lejos): un círculo con la cantidad y los colores de lo que tiene.
  function clusterElement(d) {
    var node = document.createElement('div');
    var colors = d.members.map(function (p) { return p.live ? COLORS.live : COLORS[p.kind]; });
    var step = 100 / colors.length;
    var stops = colors.map(function (c, i) { return c + ' ' + (i * step) + '% ' + ((i + 1) * step) + '%'; }).join(', ');
    node.className = 'cluster';
    node.style.pointerEvents = 'auto';
    node.style.background = 'conic-gradient(' + stops + ')';
    node.title = d.members.map(function (p) { return p.name; }).join(' · ');
    node.innerHTML = '<span style="background:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center">' + d.members.length + '</span>';
    // Al tocarlo, se acerca a la zona (ahí los pines se apilan) y la app lista lo que hay.
    node.addEventListener('click', function (ev) { ev.stopPropagation(); tap(d.lat, d.lng, d.members[0].id); });
    return node;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Con zoom cercano, los pines muestran su resumen.
  var controls = globe.controls();
  var interacted = false; // la persona ya lo movió: no se le cambia la vista sola
  var homeSet = false;
  controls.addEventListener('start', function () { interacted = true; controls.autoRotate = false; });
  // Zoom y giro con inercia: se deslizan en lugar de moverse a saltos.
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.zoomSpeed = 0.8;

  // Durante el zoom solo se cambian clases (barato). Lo pesado (agrupar pines, grosor del viento)
  // se hace una vez, cuando la cámara se queda quieta.
  var zoomClasses = '';
  globe.onZoom(function (pov) {
    var next = (pov.altitude < NEAR ? 'near ' : '') + (pov.altitude <= SEA_MAX_ALTITUDE[3] ? 'z3' : pov.altitude <= SEA_MAX_ALTITUDE[2] ? 'z2' : '');
    if (next !== zoomClasses) {
      zoomClasses = next;
      document.body.classList.toggle('near', pov.altitude < NEAR);
      document.body.classList.toggle('z2', next.indexOf('z2') >= 0);
      document.body.classList.toggle('z3', next.indexOf('z3') >= 0);
    }
    scheduleLayout();
  });

  // Espacio libre donde tiene que entrar el planeta (la app lo manda: el lienzo ocupa toda la pantalla
  // por detrás del contenido, pero el planeta arranca del tamaño del hueco que queda libre).
  var free = null;

  // Distancia de la cámara para que el planeta ocupe casi todo el espacio libre.
  function fillAltitude() {
    var fov = (globe.camera().fov || 50) * Math.PI / 180;
    var halfHeight = Math.tan(fov / 2);
    var canvasHeight = Math.max(1, window.innerHeight);
    var w = free ? free.w : window.innerWidth;
    var h = free ? free.h : canvasHeight;
    // Radio en pantalla = tan(ángulo) / halfHeight * alto/2  →  se busca que sea el 47 % del lado más corto.
    var target = (0.94 * Math.min(w, h) / canvasHeight) * halfHeight;
    return Math.max(0.6, 1 / Math.sin(Math.atan(target)) - 1);
  }

  // Centro del planeta corrido dentro del lienzo (el lienzo queda fijo y del tamaño de la pantalla).
  // Se usa el corrimiento de la cámara: mover el planeta así es suave y no obliga a redimensionar nada.
  var offset = { x: 0, y: 0 };
  var offsetAnim = null;
  function applyOffset() {
    var w = window.innerWidth, h = window.innerHeight, cam = globe.camera();
    if (offset.x || offset.y) cam.setViewOffset(w, h, -offset.x, -offset.y, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function moveCenter(to, ms) {
    if (offsetAnim) cancelAnimationFrame(offsetAnim);
    offsetAnim = null;
    if (!ms) { offset = { x: to.x, y: to.y }; applyOffset(); return; }
    var from = { x: offset.x, y: offset.y }, start = performance.now();
    function step(now) {
      var t = Math.min(1, (now - start) / ms), e = ease(t);
      offset = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      applyOffset();
      if (t < 1) offsetAnim = requestAnimationFrame(step);
      else { offsetAnim = null; scheduleLayout(); }
    }
    offsetAnim = requestAnimationFrame(step);
  }

  function fit(ms) {
    globe.width(window.innerWidth).height(window.innerHeight);
    applyOffset();
    if (!interacted) {
      var pov = globe.pointOfView();
      globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: fillAltitude() }, ms || 0);
    }
  }
  window.addEventListener('resize', function () { fit(0); });
  globe.pointOfView({ lat: 20, lng: -30, altitude: 2.3 });
  fit();

  // ---------- Pines sin superponerse
  // Se calcula en pantalla qué pines se pisan: de lejos se juntan en un grupo con el número; de cerca se apilan.
  var layoutKey = '';
  var layoutTimer = null;
  function scheduleLayout() {
    // Se espera a que la cámara deje de moverse (cada movimiento nuevo vuelve a esperar).
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(function () {
      layoutTimer = null;
      updateArcStroke(globe.pointOfView().altitude);
      layoutPins();
    }, 180);
  }

  function facingCamera(p, pov) {
    // Se ve si está antes del horizonte: desde la altura de la cámara se ve un casquete de ángulo acos(1 / (1 + altura)).
    var R = Math.PI / 180;
    var c = Math.sin(p.lat * R) * Math.sin(pov.lat * R) + Math.cos(p.lat * R) * Math.cos(pov.lat * R) * Math.cos((p.lng - pov.lng) * R);
    return c > 1 / (1 + pov.altitude);
  }

  function layoutPins() {
    // La cámara puede haberse movido sin que se haya dibujado todavía: se actualiza antes de proyectar.
    globe.camera().updateMatrixWorld();
    var pov = globe.pointOfView();
    var visible = points.filter(function (p) { return layers[p.kind]; });
    var groups = [];
    visible.forEach(function (p) {
      var s = facingCamera(p, pov) ? globe.getScreenCoords(p.lat, p.lng, 0.01) : null;
      var group = null;
      if (s) {
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (g.screen && Math.abs(g.screen.x - s.x) < OVERLAP && Math.abs(g.screen.y - s.y) < OVERLAP) { group = g; break; }
        }
      }
      if (group) group.members.push(p);
      else groups.push({ screen: s, members: [p] });
    });

    var items = [];
    SEAS.forEach(function (s, i) {
      items.push({ type: 'sea', id: 'sea:' + i, lat: s.lat, lng: s.lng, name: s.name, tier: s.tier });
    });
    if (selectedCountry && selectedCenter) {
      items.push({ type: 'country', id: 'country:' + (isoOf(selectedCountry) || selectedCountry.properties.NAME), lat: selectedCenter[0], lng: selectedCenter[1], name: countryName(selectedCountry), below: labelBelow });
    }
    groups.forEach(function (g) {
      var first = g.members[0];
      if (g.members.length > 1 && pov.altitude > CLUSTER) {
        items.push({ type: 'cluster', id: 'c:' + first.id, lat: first.lat, lng: first.lng, members: g.members });
      } else {
        g.members.forEach(function (p, k) {
          // La pila se ancla en el primer punto del grupo.
          items.push({ type: 'pin', id: p.id + ':' + k, point: p, stack: k, size: g.members.length, lat: first.lat, lng: first.lng });
        });
      }
    });
    // Solo se redibuja si cambió el agrupamiento (redibujar en cada cuadro haría parpadear los pines).
    var key = items.map(function (d) { return d.id; }).join('|') + '#' + openPinId;
    if (key === layoutKey) return;
    layoutKey = key;
    globe.htmlElementsData(items);
  }

  function drawPins() {
    layoutKey = '';
    layoutPins();
  }

  // Las líneas de viento son más finas al acercarse (si no, de cerca se ven como bandas anchas).
  var arcStroke = 0;
  function updateArcStroke(altitude) {
    var next = Math.max(0.05, Math.min(0.6, altitude * 0.26));
    if (Math.abs(next - arcStroke) / (arcStroke || 1) > 0.15) {
      arcStroke = next;
      globe.arcStroke(next);
    }
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
  function centerOf(f) {
    var g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates, best = null, bestArea = -1;
    polys.forEach(function (rings) {
      var minX = 180, maxX = -180, minY = 90, maxY = -90;
      rings[0].forEach(function (c) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
      var area = (maxX - minX) * (maxY - minY);
      if (area > bestArea) { bestArea = area; best = [(minY + maxY) / 2, (minX + maxX) / 2]; }
    });
    return best;
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
    interacted = true;
    controls.autoRotate = false;
    openPinId = msg.pointId || null;
    selectedCountry = countryAt(msg.lat, msg.lng) ||
      (msg.iso ? countries.filter(function (f) { return isoOf(f) === msg.iso; })[0] || null : null);
    selectedCenter = selectedCountry ? centerOf(selectedCountry) : null;
    // Si el centro del país queda lejos de donde se tocó (países grandes con zoom cercano), el nombre va
    // justo debajo del lugar tocado, así se ve en pantalla sin tapar los pines (que apuntan hacia arriba).
    labelBelow = false;
    if (selectedCenter && angleBetween(selectedCenter[0], selectedCenter[1], msg.lat, msg.lng) > 12) {
      selectedCenter = [msg.lat, msg.lng];
      labelBelow = true;
    }
    refreshCountries();
    drawPins();
    globe.ringsData([{ lat: msg.lat, lng: msg.lng }]);
    var altitude = msg.pointId ? 0.4 : selectedCountry ? Math.max(0.35, Math.min(1.4, spanOf(selectedCountry) / 40)) : 0.9;
    globe.pointOfView({ lat: msg.lat, lng: msg.lng, altitude: altitude }, 1000);
    var place = selectedCountry ? countryName(selectedCountry) : seaAt(msg.lat, msg.lng);
    send({ type: 'country', name: place, iso: selectedCountry ? isoOf(selectedCountry) : null });
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
      selectedCenter = null;
      globe.ringsData([]);
      refreshCountries();
      drawPins();
    } else if (msg.type === 'wind') {
      drawWind(msg.cells);
    } else if (msg.type === 'frame') {
      // La primera vez sin animación; después (se ocultan o vuelven las tarjetas) el planeta se desliza.
      var first = !free;
      free = { w: msg.w, h: msg.h };
      moveCenter({ x: msg.dx || 0, y: msg.dy || 0 }, first ? 0 : TRANSITION_MS);
      fit(first ? 0 : TRANSITION_MS);
    } else if (msg.type === 'home') {
      // Centrar en la ubicación aproximada de la persona, si todavía no movió el planeta.
      // La primera vez sin animación (el planeta aparece ya centrado); si después cambia (ej. llega el país de la cuenta), con animación.
      if (!interacted) globe.pointOfView({ lat: msg.lat, lng: msg.lng, altitude: fillAltitude() }, homeSet ? 1200 : 0);
      homeSet = true;
    } else if (msg.type === 'reset') {
      // Logo de MSAIL: vuelve a la vista inicial (como al abrir la home) y se vuelve a ajustar solo al tamaño.
      interacted = false;
      globe.pointOfView({ lat: msg.lat, lng: msg.lng, altitude: fillAltitude() }, TRANSITION_MS);
    } else if (msg.type === 'fly') {
      // Botón Explorar: vuela hacia la zona de la persona, más cerca, para ver lo que hay alrededor.
      interacted = true;
      controls.autoRotate = false;
      globe.pointOfView({ lat: msg.lat, lng: msg.lng, altitude: msg.altitude }, TRANSITION_MS);
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
