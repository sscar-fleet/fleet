// Page de carte autonome (même fond que le logiciel : OpenFreeMap clair / nuit, satellite Esri avec noms),
// affichée dans une WebView sur iPhone et dans un iframe dans le navigateur. Elle parle à l'appli par messages :
//   appli -> carte : { type: 'maj', points, choisi, sombre, satellite, marges, trace } | { type: 'cadrer' } | { type: 'viser', id }
//   trace = trajet du jour de la voiture choisie, liste de [lng, lat] (ou null)
//   carte -> appli : { type: 'pret' } | { type: 'choisir', id } | { type: 'fond' }
export type PointCarte = {
  id: string; lat: number; lng: number; couleur: string; plaque: string; roule: boolean;
  logo?: string | null; badge?: { texte: string; fond: string; encre: string } | null;
  mot?: string | null; motCouleur?: string | null; retard?: boolean;
  // Repère façon appli SS CAR SYSTEM : photo du modèle à l'arrêt (même adresse que la liste : zéro image en plus),
  // icône vue de dessus qui tourne dans le sens de la marche quand la voiture roule
  photo?: string | null; teinte?: string; gabarit?: 'citadine' | 'berline' | 'suv' | 'utilitaire' | 'moto';
  cap?: number | null; vitesse?: number; le?: string | null; enLigne?: boolean;
};

export const CARTE_HTML = `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>
html,body,#c{margin:0;height:100%;width:100%;background:#0b0f12;overflow:hidden;-webkit-tap-highlight-color:transparent}
.r{position:relative;width:0;height:0;cursor:pointer}
.r .pt{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.45)}
.r .pt i{position:absolute;inset:-10px;border-radius:50%;border:2px solid #3b82f6;animation:p 1.8s infinite}
@keyframes p{from{transform:scale(.6);opacity:.9}to{transform:scale(1.7);opacity:0}}
.r .lg{position:absolute;right:14px;top:-15px;width:30px;height:30px;display:grid;place-items:center}
.r .lg img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}
.r .et{position:absolute;left:14px;top:-12px;display:flex;align-items:center;gap:5px;white-space:nowrap;background:#0b0f12;color:#fff;font:800 12.5px/1 -apple-system,system-ui,sans-serif;padding:5px 7px;border-radius:7px;box-shadow:0 2px 8px rgba(0,0,0,.4);letter-spacing:.02em}
.r .bs{display:inline-flex;align-items:center;height:15px;padding:0 4px;border-radius:4px;font:italic 800 9px/1 -apple-system,system-ui,sans-serif;letter-spacing:.06em}
.r .et i{font-style:normal;font-weight:700;font-size:11px;opacity:.95}
.r.rt .pt{box-shadow:0 0 0 4px #f59e0b,0 2px 8px rgba(0,0,0,.45)}
.r.rt .et{box-shadow:0 0 0 1.5px #f59e0b,0 2px 8px rgba(0,0,0,.4)}
.r.ch{z-index:10}
.r.ch .et i{color:#00140f!important}
.r.ch .pt{left:-13px;top:-13px;width:26px;height:26px;border-width:4px}
.r.ch .et{background:#19f7d6;color:#00140f;font-size:14px;padding:6px 9px;top:-14px;left:17px}
.r.ch .lg{width:36px;height:36px;top:-18px;right:17px}
.maplibregl-ctrl-attrib{font-size:9px!important}
.v{position:absolute;left:0;top:0;width:0;height:0;transform:scale(var(--e,1));transition:transform .2s}
.v .ph{position:absolute;left:-24px;top:-19px;width:48px;height:26px;object-fit:contain;opacity:0;transition:opacity .25s;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45));pointer-events:none}
.v .ph.ok{opacity:1}
.v .om{position:absolute;left:-18px;top:3px;width:36px;height:7px;border-radius:50%;background:rgba(0,0,0,.45);filter:blur(3px);opacity:0;transition:opacity .25s}
.v .ic{position:absolute;left:-18px;top:-18px;width:36px;height:36px;transition:transform .8s ease-out;opacity:0}
.v .ic svg{width:36px;height:36px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))}
.r.photo .ph.ok~.om,.r.photo .om.vu{opacity:1}
.r.icone .ic{opacity:1}
.r.icone .ph,.r.icone .om{opacity:0!important}
/* Étiquettes (modèle, plaque, état) : seulement en grand ou en zoomant, et toujours pour la voiture choisie */
body.sobre .r .et{display:none}
body.sobre .r.ch .et{display:flex}
.r.photo .pt,.r.icone .pt{display:none}
.r.photo .lg,.r.icone .lg{display:none}
.r.photo .et{top:14px;left:-30px}
.v .fl{position:absolute;left:-7px;top:-7px;width:14px;height:14px;opacity:0;transition:transform .8s ease-out,opacity .25s}
.v .fl i{position:absolute;left:3px;top:-17px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid #3b82f6;filter:drop-shadow(0 1px 1px rgba(0,0,0,.6))}
.r.photo.roule .fl{opacity:1}
.r.icone .et{left:20px;top:-12px}
.r.ch.photo .ph{transform:scale(1.2);transform-origin:50% 80%}
.r.ch.photo .et{top:16px}
</style></head><body><div id="c"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
(function(){
  var CLAIR='https://tiles.openfreemap.org/styles/liberty', NUIT='https://tiles.openfreemap.org/styles/fiord';
  var SAT={version:8,sources:{s:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri, Maxar'},n:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19}},layers:[{id:'s',type:'raster',source:'s'},{id:'n',type:'raster',source:'n'}]};
  var etat={points:[],choisi:null,sombre:true,satellite:false,marges:{haut:0,bas:0},trace:null,etiquettes:false}, traceCle='', reperes={}, carte=null, fond=null, cadre=false, clicRepere=false;
  function envoyer(m){ var s=JSON.stringify(m); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if(window.parent!==window) window.parent.postMessage({carteSuivi:m},'*'); }
  function styleVoulu(){ return etat.satellite?SAT:(etat.sombre?NUIT:CLAIR); }
  function cleStyle(){ return etat.satellite?'sat':(etat.sombre?'nuit':'clair'); }
  function esc(t){ return String(t||'').replace(/[<>&"]/g,''); }
  function esc2(t){ return String(t||'').replace(/[<>&"']/g,''); }
  function etiquette(p){
    var b=p.badge?'<span class="bs" style="background:'+p.badge.fond+';color:'+p.badge.encre+'">'+esc(p.badge.texte)+'</span>':'';
    var mot=p.mot?'<i style="color:'+(p.motCouleur||'#cbd5e1')+'">'+esc(p.mot)+'</i>':'';
    return esc(p.plaque)+b+mot;
  }
  // Icône vue de dessus, dessin maison, avant vers le haut, dans la couleur du véhicule
  var GAB={citadine:[13,28],berline:[14,34],suv:[16,34],utilitaire:[17,38],moto:[7,26]};
  function dessus(g,t){
    t=t||'#3b3f45'; var d=GAB[g]||GAB.citadine, w=d[0], h=d[1], x=22-w/2, y=22-h/2, r=g==='moto'?3.5:4.5;
    var clair=/^#(f|e|d|c)/i.test(t), vitre=clair?'#2b3440':'#0d1318', trait=clair?'rgba(0,0,0,.35)':'rgba(255,255,255,.35)';
    if(g==='moto') return '<svg viewBox="0 0 44 44"><rect x="'+(22-2.5)+'" y="'+y+'" width="5" height="'+h+'" rx="2.5" fill="#111"/><rect x="'+x+'" y="'+(y+7)+'" width="'+w+'" height="'+(h-12)+'" rx="3.5" fill="'+t+'" stroke="'+trait+'" stroke-width="1"/><rect x="'+(22-6)+'" y="'+(y+6)+'" width="12" height="2.2" rx="1.1" fill="#111"/><circle cx="22" cy="'+(y+1.5)+'" r="1.6" fill="#fff8d6"/></svg>';
    var s='<svg viewBox="0 0 44 44"><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+t+'" stroke="'+trait+'" stroke-width="1"/>';
    if(g==='utilitaire'){ s+='<rect x="'+(x+1.6)+'" y="'+(y+3.2)+'" width="'+(w-3.2)+'" height="'+(h*0.16)+'" rx="2" fill="'+vitre+'"/><rect x="'+(x+1.4)+'" y="'+(y+h*0.26)+'" width="'+(w-2.8)+'" height="'+(h*0.68)+'" rx="2" fill="'+t+'" stroke="'+trait+'" stroke-width=".8"/>'; }
    else { s+='<rect x="'+(x+1.8)+'" y="'+(y+h*0.22)+'" width="'+(w-3.6)+'" height="'+(h*0.19)+'" rx="2.4" fill="'+vitre+'"/><rect x="'+(x+2.2)+'" y="'+(y+h*0.44)+'" width="'+(w-4.4)+'" height="'+(h*0.27)+'" rx="2" fill="'+t+'" stroke="'+trait+'" stroke-width=".7"/><rect x="'+(x+2)+'" y="'+(y+h*0.74)+'" width="'+(w-4)+'" height="'+(h*0.13)+'" rx="2" fill="'+vitre+'"/>'; }
    s+='<rect x="'+(x+1.2)+'" y="'+(y+.8)+'" width="3.2" height="1.8" rx=".9" fill="#fff8d6"/><rect x="'+(x+w-4.4)+'" y="'+(y+.8)+'" width="3.2" height="1.8" rx=".9" fill="#fff8d6"/>';
    s+='<rect x="'+(x+1.2)+'" y="'+(y+h-2.4)+'" width="3" height="1.6" rx=".8" fill="#ff4d4d"/><rect x="'+(x+w-4.2)+'" y="'+(y+h-2.4)+'" width="3" height="1.6" rx=".8" fill="#ff4d4d"/></svg>';
    return s;
  }
  function marges(){ return {top:etat.marges.haut+50,bottom:etat.marges.bas+40,left:60,right:140}; }
  function cadrer(){
    if(!carte||!etat.points.length) return;
    if(etat.points.length===1){ carte.easeTo({center:[etat.points[0].lng,etat.points[0].lat],zoom:15,padding:{top:etat.marges.haut,bottom:etat.marges.bas,left:0,right:0},duration:500}); return; }
    var b=new maplibregl.LngLatBounds(); etat.points.forEach(function(p){ b.extend([p.lng,p.lat]); });
    carte.fitBounds(b,{padding:marges(),maxZoom:15,duration:500});
  }
  function viser(id){ var p=etat.points.filter(function(x){return x.id===id;})[0]; if(p&&carte) carte.easeTo({center:[p.lng,p.lat],zoom:Math.max(carte.getZoom(),15.5),padding:{top:etat.marges.haut,bottom:etat.marges.bas,left:0,right:0},duration:450}); }
  // --- Repères : un seul par voiture, réutilisé d'une mise à jour à l'autre (jamais supprimé puis recréé)
  var rates={}; // photos qui n'ont pas pu se charger : on ne les redemande plus
  var RAD=Math.PI/180;
  function roule(p){ return p.enLigne!==false && (p.vitesse||0)>=5; }
  function cible(r,maintenant){
    var p=r.p; if(!roule(p)||(p.vitesse||0)<=8||p.cap==null) return [p.lng,p.lat];
    var t0=p.le?Date.parse(p.le):r.recu; if(!isFinite(t0)) t0=r.recu;
    var dt=Math.max(0,Math.min(6,(maintenant-t0)/1000)), d=(p.vitesse/3.6)*dt;
    return [p.lng+(d*Math.sin(p.cap*RAD))/(111320*Math.cos(p.lat*RAD)), p.lat+(d*Math.cos(p.cap*RAD))/111320];
  }
  function mettreAJour(r,p,ch){
    var el=r.el, ancienne=r.p; r.p=p; r.recu=Date.now();
    var aPhoto=p.photo&&!rates[p.photo], mode=aPhoto?'photo':'icone';
    el.className='r '+mode+(roule(p)?' roule':'')+(ch?' ch':'')+(p.retard?' rt':'');
    var et=etiquette(p); if(et!==r.etq){ r.etq=et; r.et.innerHTML=et; }
    var svg=(p.gabarit||'citadine')+(p.teinte||''); if(svg!==r.svg){ r.svg=svg; r.ic.innerHTML=dessus(p.gabarit,p.teinte); }
    if(p.cap!=null) { // rotation au plus court (pas de tour complet en passant de 359° à 1°)
      var a=r.angle==null?p.cap:r.angle, diff=((p.cap-a+540)%360)-180; r.angle=a+diff; r.ic.style.transform='rotate('+r.angle+'deg)'; r.fl.style.transform='rotate('+r.angle+'deg)';
    }
    if(aPhoto&&r.img.getAttribute('data-src')!==p.photo){
      r.img.className='ph'; r.img.setAttribute('data-src',p.photo);
      r.img.onload=function(){ r.img.className='ph ok'; r.om.className='om vu'; };
      r.img.onerror=function(){ rates[p.photo]=1; r.img.removeAttribute('src'); mettreAJour(r,r.p,r.p.id===etat.choisi); };
      r.img.src=p.photo;
      if(r.img.complete&&r.img.naturalWidth>0){ r.img.className='ph ok'; r.om.className='om vu'; } // déjà en cache
    }
    if(!ancienne) { r.aff=[p.lng,p.lat]; r.m.setLngLat(r.aff); }
  }
  function dessiner(){
    if(!carte) return;
    var vus={};
    etat.points.forEach(function(p){
      vus[p.id]=1; var ch=p.id===etat.choisi, r=reperes[p.id];
      if(!r){
        var el=document.createElement('div');
        el.innerHTML='<span class="v"><span class="om"></span><span class="fl"><i></i></span><img class="ph" alt=""><span class="ic"></span></span><span class="lg"></span><span class="pt"></span><span class="et"></span>';
        el.addEventListener('click',function(e){ e.stopPropagation(); clicRepere=true; setTimeout(function(){clicRepere=false;},50); envoyer({type:'choisir',id:p.id}); });
        r={el:el,img:el.querySelector('.ph'),om:el.querySelector('.om'),ic:el.querySelector('.ic'),fl:el.querySelector('.fl'),et:el.querySelector('.et'),p:null,aff:null,angle:null};
        r.m=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([p.lng,p.lat]).addTo(carte);
        reperes[p.id]=r;
      }
      mettreAJour(r,p,ch);
    });
    Object.keys(reperes).forEach(function(id){ if(!vus[id]){ reperes[id].m.remove(); delete reperes[id]; } });
    if(!cadre&&etat.points.length){ cadre=true; setTimeout(function(){ carte.resize(); cadrer(); },350); }
    animer();
  }
  function sobre(){
    var z=carte?carte.getZoom():12;
    document.body.classList.toggle('sobre', !etat.etiquettes && !(z>=15));
    // Les voitures rapetissent quand on dézoome, pour que la carte reste lisible
    document.body.style.setProperty('--e', z>=15?1:z>=13.5?0.85:z>=12?0.7:z>=10.5?0.55:0.45);
  }
  // Une seule boucle pour toute la carte : chaque repère glisse vers sa position estimée (lissage ≈ 0,35 s), arrêtée quand plus rien ne bouge
  var boucle=null, dernier=0, glisseLe=0;
  function animer(){ if(!boucle){ dernier=performance.now(); boucle=requestAnimationFrame(pas); } }
  function pas(t){
    var dtf=Math.min(0.1,(t-dernier)/1000); dernier=t; var k=1-Math.exp(-dtf/0.35), bouge=false, maintenant=Date.now();
    Object.keys(reperes).forEach(function(id){
      var r=reperes[id], c=cible(r,maintenant); if(!r.aff) r.aff=c;
      var dx=c[0]-r.aff[0], dy=c[1]-r.aff[1];
      if(Math.abs(dx)>1e-7||Math.abs(dy)>1e-7){ r.aff=[r.aff[0]+dx*k,r.aff[1]+dy*k]; r.m.setLngLat(r.aff); bouge=true; }
      if(roule(r.p)&&(r.p.vitesse||0)>8) bouge=true;
    });
    // Carte qui suit la voiture choisie quand elle roule, sauf si on vient de la faire glisser au doigt
    var ch=etat.choisi&&reperes[etat.choisi];
    if(ch&&roule(ch.p)&&ch.aff&&Date.now()-glisseLe>15000) carte.jumpTo({center:ch.aff});
    boucle=bouge?requestAnimationFrame(pas):null;
  }
  // Trajet du jour : une ligne bleue sous les repères, remise après chaque changement de fond
  function tracer(){
    if(!carte||!carte.isStyleLoaded()) return;
    var t=etat.trace&&etat.trace.length>1?etat.trace:null, src=carte.getSource('trajet');
    var donnees={type:'Feature',properties:{},geometry:{type:'LineString',coordinates:t||[]}};
    if(!src){
      if(!t) return;
      carte.addSource('trajet',{type:'geojson',data:donnees});
      carte.addLayer({id:'trajet-bord',type:'line',source:'trajet',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0b0f12','line-width':8,'line-opacity':.55}});
      carte.addLayer({id:'trajet',type:'line',source:'trajet',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#60a5fa','line-width':4.5}});
    } else src.setData(donnees);
    var cle=t?t.length+':'+t[0]:''; if(t&&cle!==traceCle){ var b=new maplibregl.LngLatBounds(); t.forEach(function(x){b.extend(x);}); carte.fitBounds(b,{padding:{top:etat.marges.haut+40,bottom:etat.marges.bas+40,left:50,right:140},maxZoom:15.5,duration:500}); }
    traceCle=cle;
  }
  function recevoir(m){
    if(typeof m==='string'){ try{ m=JSON.parse(m); }catch(e){ return; } }
    if(!m||!m.type) return;
    if(m.type==='maj'){
      var avant=etat.choisi; etat.points=m.points||[]; etat.choisi=m.choisi||null; etat.sombre=!!m.sombre; etat.satellite=!!m.satellite; etat.marges=m.marges||etat.marges; etat.trace=m.trace||null; etat.etiquettes=!!m.etiquettes; sobre();
      if(carte&&fond!==cleStyle()){ fond=cleStyle(); traceCle=''; carte.setStyle(styleVoulu()); }
      dessiner();
      if(etat.choisi&&etat.choisi!==avant&&!etat.trace) viser(etat.choisi);
      tracer();
    } else if(m.type==='cadrer') cadrer(); else if(m.type==='viser') viser(m.id);
  }
  window.recevoir=recevoir;
  window.addEventListener('message',function(e){ if(e.data&&e.data.carteSuivi) recevoir(e.data.carteSuivi); });
  document.addEventListener('message',function(e){ recevoir(e.data); });
  function demarrer(){
    if(!window.maplibregl){ return setTimeout(demarrer,100); }
    fond=cleStyle();
    carte=new maplibregl.Map({container:'c',style:styleVoulu(),center:[2.3522,48.8566],zoom:11,attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false,touchPitch:false});
    carte.touchZoomRotate.disableRotation();
    carte.on('click',function(){ if(!clicRepere) envoyer({type:'fond'}); });
    carte.on('zoomend',sobre); carte.on('zoom',sobre);
    carte.on('dragstart',function(e){ if(e&&e.originalEvent) glisseLe=Date.now(); });
    carte.on('load',function(){ carte.resize(); dessiner(); tracer(); });
    [300,1000,2500].forEach(function(ms){ setTimeout(function(){ carte.resize(); },ms); }); // iPhone : la carte se cale sur la vraie taille de son cadre
    carte.on('style.load',function(){ tracer(); });
    window.addEventListener('resize',function(){ carte.resize(); });
    envoyer({type:'pret'});
  }
  demarrer();
})();
</script></body></html>`;
