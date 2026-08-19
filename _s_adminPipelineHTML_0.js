
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function day(s){return s?String(s).slice(0,10):'—'}
 var LBL={producing:'Producing',quoting:'Quoting',dormant:'Dormant',prospect:'Prospect'};
 // Least friction first. BenefitLab carries name, agency, phone, email AND logo into the quote;
 // an ABY account prefills their own details; neither means retyping everything, every time --
 // which is the row worth a phone call.
 function canQuote(x){
   if(x.benefitlab===true) return '<span class="pill producing">BenefitLab</span>';
   if(x.has_account) return '<span class="pill quoting">ABY account</span>';
   if(x.benefitlab===null) return '<span class="pill prospect" title="BenefitLab could not be reached, so this may be understated">unknown</span>';
   return '<span class="muted">neither</span>';
 }
 function msg(el,t,good){el.textContent=t;el.style.display='block';el.style.background=good?'#e8f4ec':'#fdecec';el.style.color=good?'#1a5c3a':'#a12622'}
 function priSelect(kind,id,cur){
   return '<select data-k="'+kind+'" data-id="'+esc(id)+'" class="pri">'
     +['','A','B','C'].map(function(v){return '<option value="'+v+'"'+((cur||'')===v?' selected':'')+'>'+(v||'—')+'</option>'}).join('')+'</select>';
 }
 document.getElementById('add').onclick=async function(){
   var people=document.getElementById('box').value.split(/\r?\n/).map(function(l){
     var pcs=l.split(','); if(pcs.length<2) return null;
     return {agency:(pcs[0]||'').trim(), name:(pcs.length>2?pcs[1]:'').trim(), email:pcs[pcs.length-1].trim()};
   }).filter(function(x){return x&&x.email});
   if(!people.length){msg(document.getElementById('addMsg'),'Add at least one line as: agency, name, email',false);return}
   var r=await fetch('/api/admin/prospects',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({people:people,rep:document.getElementById('newRep').value,priority:document.getElementById('newPri').value})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){msg(document.getElementById('addMsg'),d.error||'Could not add.',false);return}
   var bits=[];
   if(d.added.length) bits.push(d.added.length+' added');
   if(d.skipped.length) bits.push(d.skipped.length+' already on the list');
   if(d.failed.length) bits.push(d.failed.length+' rejected ('+d.failed.map(function(x){return x.email}).join(', ')+')');
   msg(document.getElementById('addMsg'),bits.join('. '),!d.failed.length);
   document.getElementById('box').value=''; load();
 };
 // The spreadsheet's own spellings, mapped to the tool's product ids -- the same table the 2026
 // import used, so a manually logged quote filters and reports exactly like a generated one.
 var PMAP={'cobra':'cobra','erisa wrap':'erisa','erisa':'erisa','fsa':'fsa','dcap':'fsa','lfsa':'fsa',
   'hsa':'hsa','pop':'pop','pop / section 125':'pop','section 125':'pop','aca':'aca',
   'aca 1094/1095 reporting':'aca','hra':'hra','tx state continuation':'stateContinuation',
   'state continuation':'stateContinuation','qtb':'section132','medicare hra':'mpra','ichra':'ichra'};
 document.getElementById('qAdd').onclick=async function(){
   var raw=document.getElementById('qProducts').value.split(',').map(function(x){return x.trim()}).filter(Boolean);
   var ids=[], unknown=[];
   raw.forEach(function(x){ var id=PMAP[x.toLowerCase()]; if(id) ids.push('product-'+id); else unknown.push(x); });
   // ⛔ An unrecognised product is REPORTED, never dropped. A silently missing product is an
   // understated count that nobody can see.
   if(unknown.length){
     var m=document.getElementById('qMsg');
     m.textContent='Not recognised: '+unknown.join(', ')+'. Use names like COBRA, FSA, HSA, POP, ERISA Wrap, ACA, HRA, QTB.';
     m.style.display='block'; m.style.background='#fdecec'; m.style.color='#a12622'; return;
   }
   var r=await fetch('/api/admin/quote',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({employer:document.getElementById('qEmployer').value,
       agency:document.getElementById('qAgency').value, quotedOn:document.getElementById('qWhen').value,
       products:ids, rep:document.getElementById('qRep').value, status:document.getElementById('qStatus').value,
       commissionIncluded:document.getElementById('qComm').checked,
       firstYearValue:document.getElementById('qValue').value, employeeCount:document.getElementById('qHeads').value})});
   var d=await r.json().catch(function(){return{}});
   var m=document.getElementById('qMsg');
   m.style.display='block';
   m.style.background=r.ok?'#e8f4ec':'#fdecec'; m.style.color=r.ok?'#1a5c3a':'#a12622';
   m.textContent=r.ok?('Logged as '+d.quoteNumber):(d.error||'Could not log it.');
   if(r.ok){['qEmployer','qAgency','qProducts','qValue','qHeads'].forEach(function(i){document.getElementById(i).value=''}); load();}
 };
 ['fRep','fStatus','fPri'].forEach(function(id){document.getElementById(id).onchange=load});

 // Sorting for "Everyone we track". Eric asked for it on the quote log -- "Why can't we sort by
 // agent name or agency name?" -- and this is the page that IS the list of agents and agencies,
 // so the same want applies with more force.
 // ⭐ The rows are HELD rather than re-fetched on each sort. Re-querying the server to reorder rows
 // already on screen is slow, and it can quietly return a DIFFERENT set if anything changed in
 // between -- so the list would appear to sort and also silently gain or lose a row.
 var PEOPLE=[], sortKey='agency', sortDir=1;
 var SORTV={
   agency:function(x){return String(x.agency_name||'').toLowerCase()},
   agent:function(x){return String(x.name||'').toLowerCase()},
   email:function(x){return String(x.email||'').toLowerCase()},
   status:function(x){return String(x.status||'')},
   quotes:function(x){return Number(x.quote_count||0)},
   last:function(x){return String(x.last_quote||'')},
   priority:function(x){return String(x.priority||'')}
 };
 function sortPeople(list){
   var g=SORTV[sortKey]||SORTV.agency;
   return list.slice().sort(function(a,b){
     var x=g(a), y=g(b);
     // ⚠️ BLANKS SINK IN BOTH DIRECTIONS. A prospect with no agency name is not "first
     // alphabetically", it is unknown -- and floating the unnamed to the top of every ascending
     // sort buries the rows somebody is actually looking for. Same rule as the quote log.
     var xe=(x===''||x===null||x===undefined), ye=(y===''||y===null||y===undefined);
     if(xe&&!ye) return 1;
     if(!xe&&ye) return -1;
     if(x<y) return -1*sortDir;
     if(x>y) return 1*sortDir;
     return 0;
   });
 }
 function arrow(k){ return sortKey===k ? (sortDir===1?' ▲':' ▼') : ''; }
 function hcell(k,label,cls){
   return '<th class="srt'+(cls?' '+cls:'')+'" data-k="'+k+'">'+label+arrow(k)+'</th>';
 }

 async function load(){
   var q=[];
   if(document.getElementById('fRep').value) q.push('rep='+document.getElementById('fRep').value);
   if(document.getElementById('fStatus').value) q.push('status='+document.getElementById('fStatus').value);
   if(document.getElementById('fPri').value) q.push('priority='+document.getElementById('fPri').value);
   var d=await (await fetch('/api/admin/pipeline'+(q.length?('?'+q.join('&')):''))).json().catch(function(){return{}});
   var rows=d.people||[];
   document.getElementById('explain').textContent=
     'Status is worked out from the quote history and cannot be edited: Producing means a sold quote in the last '
     +(d.windowDays||365)+' days, Quoting means a quote in that window, Dormant means quoted before but not since, Prospect means never quoted.';
   var c={producing:0,quoting:0,dormant:0,prospect:0};
   rows.forEach(function(x){c[x.status]=(c[x.status]||0)+1});
   if(d.benefitlabChecked===false)
     document.getElementById('explain').textContent+=
       ' ⚠ BenefitLab could not be reached, so "Can quote" shows unknown rather than guessing.';
   document.getElementById('counts').textContent=
     c.producing+' producing · '+c.quoting+' quoting · '+c.dormant+' dormant · '+c.prospect+' prospect';
   PEOPLE = rows;
   renderList();
 }

 function renderList(){
   var rows = sortPeople(PEOPLE);
   document.getElementById('list').innerHTML = rows.length
     ? '<table><thead><tr>'
       + hcell('agency','Agency') + hcell('agent','Agent') + hcell('email','Email')
       + hcell('status','Status') + hcell('quotes','Quotes','n') + hcell('last','Last quote')
       // ⛔ "Can quote" and "Note" are NOT sortable, deliberately. Can-quote is a live lookup
       // against BenefitLab that can read "unknown" when it could not be reached, so an order built
       // on it would change meaning between refreshes; Note is free text nobody scans in order.
       + '<th>Can quote</th>' + hcell('priority','Priority') + '<th>Note</th>'
       + '</tr></thead><tbody>'
       + rows.map(function(x){
           return '<tr><td>'+esc(x.agency_name||'—')+'</td><td>'+esc(x.name||'—')+'</td><td>'+esc(x.email)+'</td>'
             +'<td><span class="pill '+x.status+'">'+LBL[x.status]+'</span></td>'
             +'<td class="n">'+x.quote_count+'</td><td>'+day(x.last_quote)+'</td>'
             +'<td>'+canQuote(x)+'</td>'
             +'<td>'+priSelect('broker',x.id,x.priority)+'</td>'
             +'<td><input class="note" data-id="'+esc(x.id)+'" value="'+esc(x.notes||'')+'" placeholder="…"></td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">Nobody on the list yet. Paste some above.</p>';
   // ⭐ Clicking the SAME column flips direction; a NEW column starts at its natural direction --
   // A-Z for a name, and biggest-first for a count or a date, because "who has quoted most" and
   // "who quoted most recently" are the questions those columns get opened for.
   Array.prototype.forEach.call(document.querySelectorAll('th.srt'),function(h){
     h.onclick=function(){
       var k=h.getAttribute('data-k');
       if(k===sortKey) sortDir=-sortDir;
       else { sortKey=k; sortDir=(k==='quotes'||k==='last')?-1:1; }
       renderList();
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('select.pri'),function(sel){
     sel.onchange=async function(){
       var r=await fetch('/api/admin/rate',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({kind:sel.getAttribute('data-k'),id:sel.getAttribute('data-id'),priority:sel.value})});
       if(r.ok) load(); else await failed(r,'Could not save that priority.');
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('input.note'),function(inp){
     inp.onchange=async function(){
       // ⚠️ THIS ONE HAD NO RELOAD EITHER, so a failed save left the typed note sitting on screen
       // looking saved, with nothing anywhere that disagreed.
       var r=await fetch('/api/admin/rate',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({kind:'broker',id:inp.getAttribute('data-id'),notes:inp.value})});
       if(!r.ok) await failed(r,'Could not save that note.');
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
