// Page de carte autonome (même fond que le logiciel : OpenFreeMap clair / nuit, satellite Esri avec noms),
// affichée dans une WebView sur iPhone et dans un iframe dans le navigateur. Elle parle à l'appli par messages :
//   appli -> carte : { type: 'maj', points, choisi, sombre, satellite, marges } | { type: 'cadrer' } | { type: 'viser', id }
//   carte -> appli : { type: 'pret' } | { type: 'choisir', id } | { type: 'fond' }
export type PointCarte = {
  id: string; lat: number; lng: number; couleur: string; plaque: string; roule: boolean;
  logo?: string | null; badge?: { texte: string; fond: string; encre: string } | null;
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
.r.ch{z-index:10}
.r.ch .pt{left:-13px;top:-13px;width:26px;height:26px;border-width:4px}
.r.ch .et{background:#19f7d6;color:#00140f;font-size:14px;padding:6px 9px;top:-14px;left:17px}
.r.ch .lg{width:36px;height:36px;top:-18px;right:17px}
.maplibregl-ctrl-attrib{font-size:9px!important}
</style></head><body><div id="c"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
(function(){
  var CLAIR='https://tiles.openfreemap.org/styles/liberty', NUIT='https://tiles.openfreemap.org/styles/fiord';
  var SAT={version:8,sources:{s:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Esri, Maxar'},n:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19}},layers:[{id:'s',type:'raster',source:'s'},{id:'n',type:'raster',source:'n'}]};
  var etat={points:[],choisi:null,sombre:true,satellite:false,marges:{haut:0,bas:0}}, reperes={}, carte=null, fond=null, cadre=false, clicRepere=false;
  function envoyer(m){ var s=JSON.stringify(m); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if(window.parent!==window) window.parent.postMessage({carteSuivi:m},'*'); }
  function styleVoulu(){ return etat.satellite?SAT:(etat.sombre?NUIT:CLAIR); }
  function cleStyle(){ return etat.satellite?'sat':(etat.sombre?'nuit':'clair'); }
  function esc(t){ return String(t||'').replace(/[<>&"]/g,''); }
  function html(p,ch){
    var b=p.badge?'<span class="bs" style="background:'+p.badge.fond+';color:'+p.badge.encre+'">'+esc(p.badge.texte)+'</span>':'';
    var lg=p.logo?'<span class="lg"><img src="'+esc(p.logo)+'" onerror="this.parentNode.remove()"></span>':'';
    return lg+'<span class="pt" style="background:'+p.couleur+'">'+(p.roule?'<i></i>':'')+'</span><span class="et">'+esc(p.plaque)+b+'</span>';
  }
  function marges(){ return {top:etat.marges.haut+50,bottom:etat.marges.bas+40,left:60,right:140}; }
  function cadrer(){
    if(!carte||!etat.points.length) return;
    if(etat.points.length===1){ carte.easeTo({center:[etat.points[0].lng,etat.points[0].lat],zoom:15,padding:{top:etat.marges.haut,bottom:etat.marges.bas,left:0,right:0},duration:500}); return; }
    var b=new maplibregl.LngLatBounds(); etat.points.forEach(function(p){ b.extend([p.lng,p.lat]); });
    carte.fitBounds(b,{padding:marges(),maxZoom:15,duration:500});
  }
  function viser(id){ var p=etat.points.filter(function(x){return x.id===id;})[0]; if(p&&carte) carte.easeTo({center:[p.lng,p.lat],zoom:Math.max(carte.getZoom(),15.5),padding:{top:etat.marges.haut,bottom:etat.marges.bas,left:0,right:0},duration:450}); }
  function dessiner(){
    if(!carte) return;
    var vus={};
    etat.points.forEach(function(p){
      vus[p.id]=1; var ch=p.id===etat.choisi, cle=html(p,ch)+(ch?'1':'0'), r=reperes[p.id];
      if(r&&r.cle!==cle){ r.m.remove(); r=null; }
      if(!r){
        var el=document.createElement('div'); el.className='r'+(ch?' ch':''); el.innerHTML=html(p,ch);
        el.addEventListener('click',function(e){ e.stopPropagation(); clicRepere=true; setTimeout(function(){clicRepere=false;},50); envoyer({type:'choisir',id:p.id}); });
        r={m:new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([p.lng,p.lat]).addTo(carte),cle:cle};
        reperes[p.id]=r;
      } else r.m.setLngLat([p.lng,p.lat]);
    });
    Object.keys(reperes).forEach(function(id){ if(!vus[id]){ reperes[id].m.remove(); delete reperes[id]; } });
    if(!cadre&&etat.points.length){ cadre=true; setTimeout(function(){ carte.resize(); cadrer(); },350); }
  }
  function recevoir(m){
    if(typeof m==='string'){ try{ m=JSON.parse(m); }catch(e){ return; } }
    if(!m||!m.type) return;
    if(m.type==='maj'){
      var avant=etat.choisi; etat.points=m.points||[]; etat.choisi=m.choisi||null; etat.sombre=!!m.sombre; etat.satellite=!!m.satellite; etat.marges=m.marges||etat.marges;
      if(carte&&fond!==cleStyle()){ fond=cleStyle(); carte.setStyle(styleVoulu()); }
      dessiner();
      if(etat.choisi&&etat.choisi!==avant) viser(etat.choisi);
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
    carte.on('load',function(){ dessiner(); });
    window.addEventListener('resize',function(){ carte.resize(); });
    envoyer({type:'pret'});
  }
  demarrer();
})();
</script></body></html>`;
