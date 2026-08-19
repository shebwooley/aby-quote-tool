
 var rep='';
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function day(s){return s?String(s).slice(0,10):'—'}
 Array.prototype.forEach.call(document.querySelectorAll('.filters button'),function(b){
   b.onclick=function(){
     rep=b.getAttribute('data-rep');
     Array.prototype.forEach.call(document.querySelectorAll('.filters button'),function(x){x.className=''});
     b.className='on'; load();
   };
 });
 function repSelect(kind,id,cur){
   var o=['','eric','niels'].map(function(v){
     return '<option value="'+v+'"'+((cur||'')===v?' selected':'')+'>'+(v===''?'—':(v==='eric'?'Eric':'Niels'))+'</option>';
   }).join('');
   return '<select data-kind="'+kind+'" data-id="'+esc(id)+'">'+o+'</select>';
 }
 function wireSelects(){
   Array.prototype.forEach.call(document.querySelectorAll('select[data-id]'),function(sel){
     sel.onchange=async function(){
       var r=await fetch('/api/admin/assign',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({kind:sel.getAttribute('data-kind'),id:sel.getAttribute('data-id'),rep:sel.value})});
       if(r.ok) load(); else await failed(r,'Could not save that owner.');
     };
   });
 }
 // Sorting for the three list tables on this page (Eric, 2026-08-19).
 // ⭐ ONE HELPER SHARED BY ALL THREE rather than three copies. Three hand-written sorts is three
 // places for the blank-handling rule to drift, and that rule is the one that matters.
 // ⭐ The rows are CACHED so re-sorting does not re-query. Reordering what is already on screen
 // must not be able to return a different set than the one being looked at.
 var CACHE={brokers:[],byAgency:[],byAgent:[]}, SORTS={}, paint=function(){};
 var TOP_N=25, SHOW_ALL={};
 // ⚠️ THE DEFAULT DIRECTION FOLLOWS THE DEFAULT KEY. Initialising every table ascending put
 // '(no agency)' with 12 quotes above MMA with 36 on first paint -- technically sorted, and the
 // wrong way round for the only question that table is opened to answer.
 function isDesc(k){ return k==='n'||k==='quotes'||k==='agents'||k==='last'; }
 function sorted(tbl,rows,getters,defKey){
   var s=SORTS[tbl]||(SORTS[tbl]={k:defKey,d:isDesc(defKey)?-1:1});
   var g=getters[s.k]||getters[defKey];
   return rows.slice().sort(function(a,b){
     var x=g(a), y=g(b);
     // ⚠️ BLANKS SINK IN BOTH DIRECTIONS -- an unknown agency is not "first alphabetically".
     var xe=(x===''||x===null||x===undefined), ye=(y===''||y===null||y===undefined);
     if(xe&&!ye) return 1;
     if(!xe&&ye) return -1;
     if(x<y) return -1*s.d;
     if(x>y) return 1*s.d;
     return 0;
   });
 }
 function hc(tbl,k,label,cls){
   var s=SORTS[tbl]||{};
   var mark = s.k===k ? (s.d===1?' ▲':' ▼') : '';
   return '<th class="srt'+(cls?' '+cls:'')+'" data-t="'+tbl+'" data-k="'+k+'">'+label+mark+'</th>';
 }
 function wireSort(){
   Array.prototype.forEach.call(document.querySelectorAll('th.srt'),function(h){
     h.onclick=function(){
       var tbl=h.getAttribute('data-t'), k=h.getAttribute('data-k');
       var s=SORTS[tbl]||(SORTS[tbl]={k:k,d:1});
       if(s.k===k) s.d=-s.d;
       // A count or a date opens biggest/newest first; a name opens A-Z.
       else { s.k=k; s.d=isDesc(k)?-1:1; }
       paint();
     };
   });
 }

 async function load(){
   var q=rep?('?rep='+encodeURIComponent(rep)):'';
   var b=await (await fetch('/api/admin/brokers'+q)).json().catch(function(){return{}});
   var list=b.brokers||[];
   CACHE.brokers=list;
   paintBrokers();
   function paintBrokers(){
   var list=sorted('brokers',CACHE.brokers,{
     name:function(x){return String(x.name||'').toLowerCase()},
     email:function(x){return String(x.email||'').toLowerCase()},
     agency:function(x){return String(x.agency_name||'').toLowerCase()},
     role:function(x){return String(x.role||'member')},
     quotes:function(x){return Number(x.quote_count||0)},
     last:function(x){return String(x.last_login_at||'')}
   },'name');
   document.getElementById('brokers').innerHTML = list.length
     ? '<table><thead><tr>'+hc('brokers','name','Name')+hc('brokers','email','Email')
       +hc('brokers','agency','Agency')+hc('brokers','role','Role')
       +hc('brokers','quotes','Quotes','n')+hc('brokers','last','Last sign-in')
       +'<th>Status</th><th>Owner</th></tr></thead><tbody>'
       + list.map(function(x){
           return '<tr><td>'+esc(x.name||'—')+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.agency_name||'—')+'</td><td>'+esc(x.role||'member')+'</td>'
             +'<td class="n">'+x.quote_count+'</td><td class="date">'+day(x.last_login_at)+'</td>'
             +'<td>'+(x.pending?'<span class="muted">invited</span>':'active')+'</td><td>'+repSelect('broker',x.id,x.assigned_rep)+'</td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">No broker accounts yet.</p>';
   }

   var st=await (await fetch('/api/admin/stats'+q)).json().catch(function(){return{}});
   if(st.totals) document.getElementById('totals').textContent=
     st.totals.quotes+' quotes'
     +(st.totals.brokers==null?'':' · '+st.totals.brokers+' brokers')
     +(st.totals.agencies==null?'':' · '+st.totals.agencies+' agencies');
   // 🔴 SAY SO WHEN A SECTION COULD NOT BE READ. An empty table and an unreadable one look
   // identical, and this whole page rendered blank when a single query failed -- with the reason
   // sitting unread in the response. A screen that cannot explain itself sends somebody hunting.
   var warn=document.getElementById('statsWarn');
   var bad=st.unavailable?Object.keys(st.unavailable):[];
   if(warn){
     if(bad.length||st.error){
       warn.style.display='block';
       warn.textContent=(bad.length?('Some sections could not be read: '+bad.join(', ')+'. '):'Something did not load. ')
         +'This usually means the database is behind the code — open /api/migrate while signed in. Details: '
         +(st.error||st.unavailable[bad[0]]||'unknown');
     } else { warn.style.display='none'; }
   }
   CACHE.byAgency=st.byAgency||[];
   paintByAgency();
   // 🔴🔴 THESE TWO TABLES HOLD 235 ROWS EACH SINCE THE 2024-2026 IMPORT, AND THE PAGE WAS 31
 // SCREENS TALL. "Quotes by status" and "Open quotes, by age" -- the two short summaries most
 // worth glancing at -- sat below 18,000 pixels of table and were effectively unreachable.
 // ⭐ The top rows are the valuable ones (both tables sort by volume), so the fix is a CAP with a
 // way past it, not a collapse: you still land on the biggest agencies without scrolling.
 // ⛔ AND THE CAP SAYS SO. A list that quietly stops at 25 is indistinguishable from an agency
 // book that only has 25 in it -- the same defect as the 300-of-1795 quote count (TRAPS #237).
 // ⚠️ TOP_N and SHOW_ALL are declared with CACHE, not here: paint() runs before this point
 // in load(), and a var assigned later reads as undefined when the first paint uses it.
 function capRows(key, rows){
   return SHOW_ALL[key] ? rows : rows.slice(0, TOP_N);
 }
 function moreRow(key, shown, total, cols){
   if (total <= TOP_N) return '';
   var label = SHOW_ALL[key]
     ? 'Showing all ' + total + ' — show the top ' + TOP_N + ' only'
     : 'Showing the top ' + shown + ' of ' + total + ' — show all';
   return '<tr class="morerow"><td colspan="' + cols + '" style="text-align:center;padding:10px">'
     + '<button type="button" class="morebtn" data-k="' + key + '" style="background:none;border:0;'
     + 'color:#2f6f4f;font-size:12.5px;cursor:pointer;text-decoration:underline">' + label + '</button>'
     + '</td></tr>';
 }
 function wireMore(){
   Array.prototype.forEach.call(document.querySelectorAll('.morebtn'), function(b){
     b.onclick = function(){ var k = b.getAttribute('data-k'); SHOW_ALL[k] = !SHOW_ALL[k]; paint(); };
   });
 }

 function paintByAgency(){
   var ag=sorted('byAgency',CACHE.byAgency,{
     agency:function(x){return String(x.agency_label||x.agency||'').toLowerCase()},
     n:function(x){return Number(x.n||0)},
     agents:function(x){return Number(x.agents||0)},
     last:function(x){return String(x.last_quote||'')}
   },'n');
   document.getElementById('byAgency').innerHTML = ag.length
     ? '<table><thead><tr>'+hc('byAgency','agency','Agency')+hc('byAgency','n','Quotes','n')
       +hc('byAgency','agents','Agents','n')+hc('byAgency','last','Last quote')
       +'<th>Owner</th></tr></thead><tbody>'
       + capRows('byAgency', ag).map(function(x){
           return '<tr><td>'+esc(x.agency_label||x.agency||'(no agency)')+'</td><td class="n">'+x.n+'</td><td class="n">'+x.agents+'</td><td class="date">'+day(x.last_quote)+'</td>'
             +'<td>'+(x.agency_id?repSelect('agency',x.agency_id,x.rep):'<span class="muted">—</span>')+'</td></tr>';
         }).join('')+moreRow('byAgency', capRows('byAgency', ag).length, ag.length, 5)+'</tbody></table>'
     : '<p class="muted">Nothing yet.</p>';
   }
   var SL={P:'Pending',I:'In process',S:'Sold',D:'Dead'};
   function money(v){return v?('$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:0})):'—'}
   var bs=st.byStatus||[];
   document.getElementById('byStatus').innerHTML = bs.length
     ? '<table><thead><tr><th>Status</th><th class="n">Quotes</th><th class="n">First-year value</th><th>Based on</th></tr></thead><tbody>'
       + bs.map(function(x){
           return '<tr><td>'+esc(SL[x.status]||x.status)+'</td><td class="n">'+x.n+'</td><td class="n">'+money(x.value)+'</td>'
             +'<td class="muted">'+x.valued+' of '+x.n+' priced</td></tr>';
         }).join('')+'</tbody></table>'
       + '<p class="sub" style="margin-top:8px">Quotes run before today carry no value, so those totals are drawn only from the ones that do.</p>'
     : '<p class="muted">Nothing yet.</p>';
   var AL={week:'Last 7 days',month:'8 to 30 days',quarter:'31 to 90 days',older:'Over 90 days'};
   var ordered=['week','month','quarter','older'], ag2=st.aging||[];
   document.getElementById('aging').innerHTML = ag2.length
     ? '<table><thead><tr><th>Age</th><th class="n">Open quotes</th><th class="n">Value</th></tr></thead><tbody>'
       + ordered.filter(function(k){return ag2.some(function(x){return x.bucket===k})}).map(function(k){
           var x=ag2.find(function(y){return y.bucket===k});
           return '<tr><td>'+AL[k]+'</td><td class="n">'+x.n+'</td><td class="n">'+money(x.value)+'</td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">No open quotes.</p>';
   CACHE.byAgent=st.byAgent||[];
   paintByAgent();
   function paintByAgent(){
   var agt=sorted('byAgent',CACHE.byAgent,{
     name:function(x){return String(x.name||'').toLowerCase()},
     email:function(x){return String(x.email||'').toLowerCase()},
     agency:function(x){return String(x.agency||'').toLowerCase()},
     n:function(x){return Number(x.n||0)},
     last:function(x){return String(x.last_quote||'')}
   },'n');
   document.getElementById('byAgent').innerHTML = agt.length
     ? '<table><thead><tr>'+hc('byAgent','name','Agent')+hc('byAgent','email','Email')
       +hc('byAgent','agency','Agency')+hc('byAgent','n','Quotes','n')
       +hc('byAgent','last','Last quote')+'</tr></thead><tbody>'
       + capRows('byAgent', agt).map(function(x){
           // ⭐ A ROW IS NAMED BY WHATEVER IT HAS. Most of the imported book carries an agency and
           // no broker name or email, and printing a dash where the name goes made those rows look
           // like broken data rather than what they are: a quote we know the agency for.
           var who = x.name || x.email || (x.agency ? x.agency : '') || 'Not stated';
           var viaAgency = !x.name && !x.email && x.agency;
           return '<tr><td>'+esc(who)
             +(viaAgency?' <span class="muted" title="This quote records an agency but no individual broker">(agency only)</span>':'')
             +'</td><td>'+esc(x.email||'—')+'</td><td>'+esc(x.agency||'—')+'</td><td class="n">'+x.n+'</td><td class="date">'+day(x.last_quote)+'</td></tr>';
         }).join('')+moreRow('byAgent', capRows('byAgent', agt).length, agt.length, 5)+'</tbody></table>'
     : '<p class="muted">Nothing yet.</p>';
   }
   wireSelects();
   wireSort();
   // Re-render the three lists from the cache when a header is clicked.
   paint=function(){ paintBrokers(); paintByAgency(); paintByAgent(); wireSelects(); wireSort(); wireCollapse(); wireMore(); };
   // ⚠️ BOTH OF THESE MUST BE CALLED HERE AS WELL AS INSIDE paint().
   // The first render happens by calling paintBrokers/paintByAgency/paintByAgent directly,
   // BEFORE paint is assigned -- so anything wired only inside paint() is missing on the
   // page you actually land on, and only appears once something triggers a repaint. The
   // show-all buttons had no handler at all until you happened to click a sort header.
   wireCollapse();
   wireMore();
 }

 // Collapse / expand, remembered in localStorage per section.
 // ⚠️ The twisty is added to the DOM rather than written into every heading, so a new card gets the
 // behaviour without anyone remembering to mark it up.
 function wireCollapse(){
   Array.prototype.forEach.call(document.querySelectorAll('.card'),function(card){
     var h=card.querySelector('h2'); if(!h||h.dataset.wired) return;
     h.dataset.wired='1';
     var key='abyfold:'+h.textContent.trim();
     var tw=document.createElement('span'); tw.className='tw'; tw.textContent='▼';
     h.insertBefore(tw,h.firstChild);
     if(localStorage.getItem(key)==='shut') card.classList.add('shut');
     h.onclick=function(){
       card.classList.toggle('shut');
       localStorage.setItem(key, card.classList.contains('shut')?'shut':'open');
     };
   });
 }

 // ⛔⛔ A WRITE THAT FAILS MUST SAY SO. These handlers used to be "await fetch(...); load();" with
 // the result thrown away, so a 500 was indistinguishable from a save: the control either snapped
 // back for no stated reason, or -- worse, where there was no reload -- kept showing what you typed
 // while the database still held the old value.
 // ⭐ Reload FIRST so the screen matches the server, then say why.
 async function failed(r, fallback){
   var d=await r.json().catch(function(){return{}});
   try { await load(); } catch(e) {}
   var w=document.getElementById('warn');
   if(w){ w.style.display='block'; w.textContent=(d.error||fallback); }
 }

 load();
