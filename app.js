/* Hedgehog — owner dashboard. Public UI code only; no keys or snapshots here.
   Data is fetched from the protected API using a bearer token kept in localStorage. */
(function () {
  "use strict";
  var DEFAULT_API = "https://smmanager.cloud/hedgehog";
  var API = localStorage.getItem("hh_api") ||
            new URLSearchParams(location.search).get("api") || DEFAULT_API;
  var TOKEN_KEY = "hh_token";
  var AUTO_MS = 5 * 60 * 1000;
  var charts = {};
  var currentBusiness = "all";

  // ---------- helpers ----------
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
  function inr(n){ if(n==null||isNaN(n)) return "unavailable";
    return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function inrC(n){ if(n==null||isNaN(n)) return "unavailable";
    var a=Math.abs(n);
    if(a>=1e7) return "₹"+(n/1e7).toFixed(2)+" Cr";
    if(a>=1e5) return "₹"+(n/1e5).toFixed(2)+" L";
    return "₹"+Math.round(n).toLocaleString("en-IN"); }
  function num(n){ if(n==null||isNaN(n)) return "unavailable";
    return Number(n).toLocaleString("en-IN"); }
  function ts(iso){ if(!iso) return "—"; try{ return new Date(iso).toLocaleString("en-IN",
    {dateStyle:"medium",timeStyle:"short"});}catch(e){return iso;} }

  function kpi(label, value, sub, opts){
    opts = opts||{};
    var cls = "kpi" + (opts.na?" na":"");
    var flag = opts.flag ? '<div class="flag">'+esc(opts.flag)+'</div>' : '';
    return '<div class="'+cls+'"><div class="label">'+esc(label)+'</div>'+
      '<div class="value '+(opts.tone||"")+'">'+value+'</div>'+
      (sub?'<div class="sub">'+sub+'</div>':'')+flag+'</div>';
  }

  // ---------- auth ----------
  function getToken(){ return localStorage.getItem(TOKEN_KEY)||""; }
  function showLogin(err){
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
    if(err){ $("loginErr").textContent=err; $("loginErr").classList.remove("hidden"); }
  }
  function showApp(){
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
  }

  function api(path, opts){
    opts = opts||{};
    return fetch(API+path, Object.assign({
      headers: Object.assign({"Authorization":"Bearer "+getToken()},
                             opts.body?{"Content-Type":"application/json"}:{}),
      cache:"no-store"
    }, opts)).then(function(r){
      if(r.status===401) throw {code:401};
      if(!r.ok) return r.text().then(function(t){ throw {code:r.status, msg:t}; });
      return r.json();
    });
  }

  // ---------- render ----------
  function renderCards(biz){
    var map = {
      "operational":"b-op","under construction":"b-build","unconnected":"b-un",
      "supplier (partial)":"b-sup","control system":"b-ctl","operational (owned)":"b-op"
    };
    $("bizCards").innerHTML = biz.map(function(b){
      var cls = map[b.status]||"b-un";
      return '<div class="card"><div class="biz-name">'+esc(b.name)+'</div>'+
        '<span class="badge '+cls+'">'+esc(b.status)+'</span>'+
        '<div class="note">'+esc(b.note||("Coverage: "+b.coverage))+'</div></div>';
    }).join("");
  }

  function renderRecon(r){
    var res = r.residual_unaccounted, pct = r.residual_pct;
    $("reconPanel").innerHTML =
      '<div class="panel-head"><h3>Lifetime sales reconciliation</h3>'+
      '<span class="muted tiny">owner-reported vs recorded</span></div>'+
      '<div class="recon-grid">'+
      '<div class="recon-item"><div class="l">Owner-reported lifetime</div><div class="v hl-plum">'+inrC(r.owner_reported_lifetime)+'</div>'+
        '<div class="recon-note">'+esc(r.owner_note)+'</div></div>'+
      '<div class="recon-item"><div class="l">Recorded (fully, Supabase)</div><div class="v hl-teal">'+inrC(r.recorded_lifetime_supabase)+'</div>'+
        '<div class="recon-note">'+esc(r.recorded_note)+'</div></div>'+
      '<div class="recon-item"><div class="l">Historical export (not imported)</div><div class="v">'+inrC(r.historical_not_imported)+'</div>'+
        '<div class="recon-note">'+esc(r.historical_note)+'</div></div>'+
      '<div class="recon-item"><div class="l">Combined reconciled</div><div class="v">'+inrC(r.combined_reconciled)+'</div>'+
        '<div class="recon-note">recorded + historical export</div></div>'+
      '<div class="recon-item"><div class="l">Residual unaccounted</div><div class="v '+(res>0?"hl-amber":"hl-teal")+'">'+inrC(res)+
        (pct!=null?' <span class="tiny">('+pct+'%)</span>':'')+'</div>'+
        '<div class="recon-note">owner − combined. Not adjusted or invented.</div></div>'+
      '<div class="recon-item"><div class="l">Pre-import legacy rows</div><div class="v">'+inrC(r.partial_legacy_cash_upi)+'</div>'+
        '<div class="recon-note">'+r.partial_legacy_days+' days · '+esc(r.partial_note)+'</div></div>'+
      '</div>';
  }

  function renderKpis(k, biz, d){
    var hasSales = (biz==="all" || biz==="nabhobazaar-nb1");
    var h = "";
    if(hasSales){
      h += kpi("Recorded sales (period)", inrC(k.recorded_sales_period),
        k.txn_period+" txns · "+k.days_with_sales+"/"+k.days_in_period+" days", {tone:"hl-teal"});
      h += kpi("Recorded sales (lifetime)", inrC(k.recorded_sales_lifetime),
        "in Supabase · since 2026-05-26", {tone:"hl-teal"});
      h += kpi("Cash / UPI (period)", inrC(k.cash_period)+" / "+inrC(k.upi_period), "payment split");
      h += kpi("Profit (period)", inrC(k.profit_est_period), esc(k.profit_note), {flag:"estimate"});
      h += kpi("Expenses (period)", inrC(k.expenses_period), "from cashbox");
      h += kpi("Vendor dues (open)", inrC(k.vendor_open_due), "unpaid invoices", {tone:"hl-amber"});
      h += kpi("Vendor inv (period)", inrC(k.vendor_amount_period), k.vendor_count_period+" invoices");
      h += kpi("Stock snapshot", num(k.stock_items)+" items", inrC(k.stock_value)+" · "+k.stock_snapshot_date, {flag:"snapshot"});
    } else if(biz==="shilpi"){
      h += kpi("Shilpi supply (all)", inrC(d.shilpi.amount), d.shilpi.rows+" vendor rows", {tone:"hl-teal"});
      h += kpi("Owner-paid", inrC(d.shilpi.owner_paid), "excluded from CashBox");
      h += kpi("Group revenue contribution", "—", "internal supply, not group revenue", {na:true});
    } else if(biz==="nabhobazaar-nb2"){
      h += kpi("NB2 Okrabari status", "Under construction", "no sales data yet", {na:true});
      h += kpi("Setup expense logged", inrC(d.expansion.okrabari_setup_expense), "LED signboard");
    } else if(biz==="warehouse"){
      h += kpi("Warehouse", "Owned", "10,000 sqft", {na:true});
      h += kpi("Separate financials", "unavailable", "flows via NabhoBazaar purchasing", {na:true});
    } else {
      h += kpi("No data source connected", "unavailable", "integration pending", {na:true});
    }
    $("kpis").innerHTML = h;
  }

  function renderDetail(k, d){
    var inv = d.inventory, v = d.vendor, a = d.attendance, s = d.shilpi;
    var attRows = (a.stats||[]).map(function(e){
      return "<tr><td>"+esc(e.employee)+"</td><td class='num'>"+e.days+"</td>"+
        "<td class='num'>"+(e.hours?e.hours.toFixed(1):"—")+"</td><td class='num'>"+e.leaves+"</td></tr>";
    }).join("") || "<tr><td colspan='4' class='muted'>unavailable</td></tr>";

    var stRows = Object.keys(inv.status||{}).map(function(s2){
      return "<tr><td>"+esc(s2)+"</td><td class='num'>"+num(inv.status[s2])+"</td></tr>"; }).join("");

    $("detailPanels").innerHTML =
      '<div class="panel"><div class="panel-head"><h3>Inventory</h3></div>'+
        '<table><tr><th>Items (latest snapshot)</th><td class="num">'+num(inv.items)+'</td></tr>'+
        '<tr><th>Stock value</th><td class="num">'+inrC(inv.value)+'</td></tr>'+
        '<tr><th>Snapshot date</th><td class="num">'+esc(inv.snapshot_date)+'</td></tr></table>'+
        (stRows?'<table style="margin-top:6px">'+stRows+'</table>':'')+
        '<div class="tiny muted" style="margin-top:6px">'+esc(inv.note)+'</div></div>'+
      '<div class="panel"><div class="panel-head"><h3>Vendor</h3></div>'+
        '<table><tr><th>Open due</th><td class="num">'+inrC(v.open_due)+'</td></tr>'+
        '<tr><th>Invoiced (all)</th><td class="num">'+inrC(v.amount_total)+'</td></tr>'+
        '<tr><th>Cash paid</th><td class="num">'+inrC(v.cash_paid_total)+'</td></tr>'+
        '<tr><th>Owner paid</th><td class="num">'+inrC(v.owner_paid_total)+'</td></tr></table></div>'+
      '<div class="panel"><div class="panel-head"><h3>Attendance</h3><span class="muted tiny">'+esc(k.days_in_period)+' day window</span></div>'+
        '<table><tr><th>Employee</th><th class="num">Days</th><th class="num">Hours</th><th class="num">Leaves</th></tr>'+
        attRows+'</table></div>'+
      '<div class="panel"><div class="panel-head"><h3>Shilpi Food &amp; Spices</h3></div>'+
        '<table><tr><th>Vendor rows</th><td class="num">'+num(s.rows)+'</td></tr>'+
        '<tr><th>Amount</th><td class="num">'+inrC(s.amount)+'</td></tr>'+
        '<tr><th>Owner paid</th><td class="num">'+inrC(s.owner_paid)+'</td></tr></table>'+
        '<div class="tiny muted" style="margin-top:6px">'+esc(s.note)+'</div></div>'+
      '<div class="panel"><div class="panel-head"><h3>Expansion</h3></div>'+
        '<table><tr><th>NB1 Morapora</th><td class="num">'+esc(d.expansion.nb1)+'</td></tr>'+
        '<tr><th>NB2 Okrabari</th><td class="num">'+esc(d.expansion.nb2)+'</td></tr>'+
        '<tr><th>Warehouse</th><td class="num">'+esc(d.expansion.warehouse)+'</td></tr></table>'+
        '<div class="tiny muted" style="margin-top:6px">'+esc(d.expansion.note)+'</div></div>';
  }

  function renderAudit(d){
    var a = d.audit, rows = (a.latest||[]).map(function(r){
      return "<tr><td>"+esc(r.date)+"</td><td><span class='pill p-"+(r.status||"WARN")+"'>"+esc(r.status)+"</span></td>"+
        "<td>"+esc(r.check)+"</td><td class='num'>"+(r.expected==null?"—":inrC(r.expected))+"</td>"+
        "<td class='num'>"+(r.actual==null?"—":inrC(r.actual))+"</td>"+
        "<td class='num'>"+(r.discrepancy==null?"—":inrC(r.discrepancy))+"</td></tr>";
    }).join("");
    $("auditPanel").innerHTML =
      '<div class="panel-head"><h3>NabhoAudit — reconciliation control</h3></div>'+
      '<div class="recon-grid" style="margin-bottom:12px">'+
      '<div class="recon-item"><div class="l">PASS</div><div class="v hl-teal">'+num(a.pass)+'</div></div>'+
      '<div class="recon-item"><div class="l">WARN</div><div class="v hl-amber">'+num(a.warn)+'</div></div>'+
      '<div class="recon-item"><div class="l">FAIL</div><div class="v" style="color:var(--red)">'+num(a.fail)+'</div></div></div>'+
      '<table><tr><th>Date</th><th>Status</th><th>Check</th><th class="num">Expected</th><th class="num">Actual</th><th class="num">Δ</th></tr>'+
      (rows||"<tr><td colspan='6' class='muted'>unavailable</td></tr>")+'</table>';
  }

  function renderSources(d){
    var rows = (d.sources||[]).map(function(s){
      var cls = s.status==="ok" ? "source-ok" : "source-err";
      return "<tr><td>"+esc(s.name)+"</td><td class='"+cls+"'>"+esc(s.status)+"</td><td class='num'>"+num(s.rows||0)+
        "</td><td class='num'>"+esc(s.earliest||"—")+"</td><td class='num'>"+esc(s.latest||"—")+"</td><td class='muted'>"+esc(s.error||"")+"</td></tr>";
    }).join("");
    var gaps = (d.gaps||[]).map(function(g){
      return "<li><b>"+esc(g.area)+"</b> — "+esc(g.detail)+" <span class='muted'>("+esc(g.impact)+")</span></li>";
    }).join("");
    $("sourcePanel").innerHTML =
      '<div class="panel-head"><h3>Source health &amp; data coverage</h3>'+
      '<span class="muted tiny">built '+ts(d.generated_at)+'</span></div>'+
      '<table><tr><th>Source</th><th>Status</th><th class="num">Rows</th><th class="num">Earliest</th><th class="num">Latest</th><th>Error</th></tr>'+
      (rows||"<tr><td colspan='6' class='muted'>unavailable</td></tr>")+'</table>'+
      '<div style="margin-top:12px"><b class="small">Known gaps</b><ul class="small muted" style="margin:6px 0 0 0">'+gaps+'</ul></div>';
  }

  // ---------- charts ----------
  function mergeSeries(rec, hist){
    var map = {}, order = [];
    function add(arr, key){
      arr.forEach(function(p){ if(map[p.date]===undefined){ map[p.date]={}; order.push(p.date);} map[p.date][key]=p.sales; });
    }
    add(hist||[], "h"); add(rec||[], "r");
    order.sort();
    return {labels:order, map:map};
  }
  var AXIS = {grid:{color:"#eef0f3"},ticks:{color:"#6b7280",maxTicksLimit:8,font:{size:10}}};
  function lineChart(canvas, labels, datasets){
    if(charts[canvas]) charts[canvas].destroy();
    charts[canvas] = new Chart($(canvas), {
      type:"line",
      data:{labels:labels, datasets:datasets},
      options:{responsive:true, maintainAspectRatio:true, interaction:{mode:"index",intersect:false},
        plugins:{legend:{display:true,labels:{color:"#6b7280",boxWidth:10,font:{size:10}}},
          tooltip:{callbacks:{label:function(c){return c.dataset.label+": "+inrC(c.parsed.y);}}}},
        scales:{x:AXIS, y:Object.assign({},AXIS,{ticks:{color:"#6b7280",font:{size:10},callback:function(v){return inrC(v);}}})}}
    });
  }

  function buildSalesChart(c){
    var m = mergeSeries(c.sales_series, c.historical_series);
    var rec = m.labels.map(function(d){ return m.map[d].r!=null?m.map[d].r:null; });
    var his = m.labels.map(function(d){ return m.map[d].h!=null?m.map[d].h:null; });
    lineChart("salesChart", m.labels, [
      {label:"Recorded (Supabase)", data:rec, borderColor:"#7c3a6d", backgroundColor:"rgba(124,58,109,.08)",
        borderWidth:2, pointRadius:0, tension:.25, spanGaps:false, fill:true},
      {label:"Historical export", data:his, borderColor:"#0f766e", backgroundColor:"rgba(15,118,110,.06)",
        borderWidth:2, borderDash:[5,4], pointRadius:0, tension:.25, spanGaps:false, fill:false}
    ]);
    $("seriesNote").textContent = c.series_grain+" grain · "+c.sales_series.length+" recorded pts";
  }

  function buildMixChart(c){
    if(charts.mixChart) charts.mixChart.destroy();
    var m = c.payment_mix_period;
    charts.mixChart = new Chart($("mixChart"), {
      type:"doughnut",
      data:{labels:["Cash","UPI"], datasets:[{data:[m.cash,m.upi],
        backgroundColor:["#7c3a6d","#0f766e"], borderWidth:0}]},
      options:{responsive:true, cutout:"62%",
        plugins:{legend:{position:"bottom",labels:{color:"#6b7280",boxWidth:10,font:{size:11}}},
          tooltip:{callbacks:{label:function(c){return c.label+": "+inrC(c.parsed);}}}}}
    });
  }

  function buildMonthly(c){
    if(charts.monthly) charts.monthly.destroy();
    charts.monthly = new Chart($("monthlyChart"), {
      type:"bar",
      data:{labels:c.monthly.map(function(m){return m.month;}),
        datasets:[
          {type:"bar",label:"Sales",data:c.monthly.map(function(m){return m.sales;}),backgroundColor:"#0f766e",borderRadius:4},
          {type:"line",label:"Profit (15% est.)",data:c.monthly.map(function(m){return m.profit_est;}),borderColor:"#b45309",backgroundColor:"#b45309",pointRadius:2,tension:.25}
        ]},
      options:{responsive:true, maintainAspectRatio:true,
        plugins:{legend:{labels:{color:"#6b7280",boxWidth:10,font:{size:10}}},
          tooltip:{callbacks:{label:function(c){return c.dataset.label+": "+inrC(c.parsed.y);}}}},
        scales:{x:AXIS, y:Object.assign({},AXIS,{ticks:{color:"#6b7280",font:{size:10},callback:function(v){return inrC(v);}}})}}
    });
  }

  // ---------- business focus ----------
  var UNCONNECTED=["zubair","nabhoacademy"], NO_SALES=["nabhobazaar-nb2","warehouse","shilpi"];
  function applyFocus(biz){
    currentBusiness = biz;
    var banner = $("notConnected");
    var hideCharts = UNCONNECTED.indexOf(biz)>=0 || NO_SALES.indexOf(biz)>=0;
    banner.classList.add("hidden");
    document.querySelectorAll(".grid2, #app > section.panel").forEach(function(s){ s.classList.remove("hidden"); });
    if(UNCONNECTED.indexOf(biz)>=0){
      banner.textContent = "No data source is connected for this business yet. Metrics show 'unavailable' rather than zero.";
      banner.classList.remove("hidden");
    } else if(biz==="nabhobazaar-nb2"){
      banner.textContent = "NB2 Okrabari is under construction — no sales data yet. Setup expenses only.";
      banner.classList.remove("hidden");
    } else if(biz==="warehouse"){
      banner.textContent = "Bowbazaar Warehouse is owned and operational; it has no separate financials (costs flow through NabhoBazaar purchasing).";
      banner.classList.remove("hidden");
    } else if(biz==="shilpi"){
      banner.textContent = "Shilpi Food & Spices appears only as a NabhoBazaar supplier (owner-paid). Internal supply — not counted as group revenue.";
      banner.classList.remove("hidden");
    }
    if(hideCharts){
      document.querySelector(".grid2").classList.add("hidden");
      $("monthlyChart").closest(".panel").classList.add("hidden");
    }
  }

  function render(d){
    renderCards(d.businesses||[]);
    applyFocus(currentBusiness || "all");
    renderKpis(d.kpis, currentBusiness, d);
    renderRecon(d.sales_reconciliation);
    renderDetail(d.kpis, d);
    renderAudit(d);
    renderSources(d);
    if(!(UNCONNECTED.indexOf(currentBusiness)>=0 || NO_SALES.indexOf(currentBusiness)>=0)){
      buildSalesChart(d.charts);
      buildMixChart(d.charts);
      buildMonthly(d.charts);
    }
    var r = d.refresh||{};
    $("updated").textContent = "Data through "+(d.data_through||"—")+" · built "+ts(d.generated_at);
    $("foot").innerHTML = "Refresh: "+esc(r.mode||"")+" · cache "+esc(r.cache_ttl_seconds||"?")+"s · "+
      "auto-refresh every 5 min. Upstream: "+esc(r.upstream||"")+". "+
      (d.errors&&d.errors.length?("<span class='source-err'>errors: "+esc(d.errors.join("; "))+"</span>"):"No source errors.");
  }

  function load(){
    showApp();
    var from=$("fromDate").value, to=$("toDate").value;
    var q=[];
    if(currentBusiness) q.push("business="+encodeURIComponent(currentBusiness));
    if(from) q.push("from="+from);
    if(to) q.push("to="+to);
    api("/api/overview"+(q.length?"?"+q.join("&"):""))
      .then(render)
      .catch(function(e){
        if(e && e.code===401){ localStorage.removeItem(TOKEN_KEY); showLogin("Session expired — enter token again."); }
        else { $("foot").innerHTML="<span class='source-err'>Load failed: "+esc((e&&e.msg)||e&&e.code||e)+"</span>"; }
      });
  }

  // ---------- events ----------
  function bind(){
    $("loginBtn").onclick = function(){
      var t=$("token").value.trim(); if(!t){ return; }
      fetch(API+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:t})})
        .then(function(r){ if(r.ok){ localStorage.setItem(TOKEN_KEY,t); $("loginErr").classList.add("hidden"); load(); }
          else { showLogin("Invalid token."); } })
        .catch(function(){ showLogin("Cannot reach API at "+API); });
    };
    $("token").addEventListener("keydown",function(e){ if(e.key==="Enter") $("loginBtn").click(); });
    $("logoutBtn").onclick = function(){ localStorage.removeItem(TOKEN_KEY); showLogin(); };
    $("refreshBtn").onclick = load;
    $("businessSel").onchange = function(){ currentBusiness=this.value; load(); };
    $("fromDate").onchange = load; $("toDate").onchange = load;
    document.querySelectorAll(".presets button").forEach(function(b){
      b.onclick = function(){
        document.querySelectorAll(".presets button").forEach(function(x){x.classList.remove("active");});
        b.classList.add("active");
        var r=b.getAttribute("data-range"), to=new Date(), from=new Date();
        if(r==="all"){ $("fromDate").value=""; $("toDate").value=""; }
        else if(r==="ytd"){ from=new Date(to.getFullYear(),0,1); }
        else { from.setDate(to.getDate()-parseInt(r,10)); }
        if(r!=="all"){ $("fromDate").value=from.toISOString().slice(0,10); $("toDate").value=to.toISOString().slice(0,10); }
        load();
      };
    });
  }

  // ---------- boot ----------
  bind();
  if(getToken()){ load(); } else { showLogin(); }
  setInterval(function(){ if(getToken() && !$("app").classList.contains("hidden")) load(); }, AUTO_MS);

  window.__HH__ = {API:API, reload:load};
})();
