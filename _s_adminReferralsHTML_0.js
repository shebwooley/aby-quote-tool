
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function money(v){return v?('$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:0})):'—'}
 function day(s){return s?String(s).slice(0,10):'—'}
 var DATA={partners:[],contacts:[],brokers:[]};

 async function load(){
   var d=await (await fetch('/api/admin/referrals')).json().catch(function(){return{}});
   DATA=d;
   var bad=d.unavailable?Object.keys(d.unavailable):[];
   var w=document.getElementById('warn');
   if(bad.length){
     w.style.display='block';
     w.textContent='Some of this could not be read: '+bad.join(', ')
       +'. If this is the first time, open /api/migrate while signed in. Details: '+d.unavailable[bad[0]];
   } else { w.style.display='none'; }
   paint();
 }

 // ⭐ The scoreboard is computed from the brokers list rather than asked for separately, so the
 // totals can never disagree with the rows printed underneath them.
 function score(rows){
   return { referred: rows.length,
            quoting: rows.filter(function(b){return b.recent>0}).length,
            producing: rows.filter(function(b){return b.sold_recent>0}).length,
            value: rows.reduce(function(a,b){return a+Number(b.value||0)},0) };
 }

 function brokerTable(rows){
   if(!rows.length) return '<p class="muted">Nobody yet.</p>';
   return '<table><thead><tr><th>Broker</th><th>Agency</th><th>Referred</th>'
     +'<th class="n">Quotes</th><th class="n">Value</th><th>Rep</th></tr></thead><tbody>'
     + rows.map(function(b){
         var reps=DATA.contacts.filter(function(c){return c.partner_id===b.partner_id});
         var sel='<select onchange="setRef(this)" data-b="'+esc(b.id)+'">'
           +'<option value="">— rep not known —</option>'
           + reps.map(function(c){
               return '<option value="'+esc(c.id)+'"'+(c.id===b.contact_id?' selected':'')+'>'
                 +esc(c.name)+(c.active?'':' (retired)')+'</option>';
             }).join('')+'</select>';
         return '<tr><td>'+esc(b.name||b.email)+'</td><td>'+esc(b.agency||'—')+'</td>'
           +'<td>'+day(b.referred_at)+'</td><td class="n">'+b.quotes+'</td>'
           +'<td class="n">'+money(b.value)+'</td><td>'+sel+'</td></tr>';
       }).join('')+'</tbody></table>';
 }

 function paint(){
   var host=document.getElementById('partners');
   host.innerHTML = DATA.partners.map(function(p){
     var mine=DATA.brokers.filter(function(b){return b.partner_id===p.id});
     var s=score(mine);
     var reps=DATA.contacts.filter(function(c){return c.partner_id===p.id});
     // Per rep, the same four numbers -- because "thank the reps" is a per-person act.
     var repRows=reps.map(function(c){
       var r=DATA.brokers.filter(function(b){return b.contact_id===c.id});
       var rs=score(r);
       return '<tr><td>'+esc(c.name)+(c.active?'':' <span class="muted">(retired)</span>')+'</td>'
         +'<td>'+esc(c.email||'—')+'</td><td class="n">'+rs.referred+'</td>'
         +'<td class="n">'+rs.quoting+'</td><td class="n">'+rs.producing+'</td>'
         +'<td class="n">'+money(rs.value)+'</td></tr>';
     }).join('');
     return '<div class="partner"><div class="phead">'
       +'<span class="pname">'+esc(p.name)+'</span>'
       +(p.kind?'<span class="muted">'+esc(p.kind)+'</span>':'')
       +'<span class="score"><span>referred <b>'+s.referred+'</b></span>'
       +'<span>quoting <b>'+s.quoting+'</b></span>'
       +'<span>producing <b>'+s.producing+'</b></span>'
       +'<span>value <b>'+money(s.value)+'</b></span></span></div>'
       +'<div class="pbody">'
       +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
       +'<input placeholder="Rep name" data-p="'+esc(p.id)+'" class="rn" style="min-width:180px">'
       +'<input placeholder="Email" data-p="'+esc(p.id)+'" class="re" style="min-width:200px">'
       +'<button class="ghost" onclick="addContact(this)" data-p="'+esc(p.id)+'">Add rep</button></div>'
       +(reps.length
          ? '<table><thead><tr><th>Rep</th><th>Email</th><th class="n">Referred</th>'
            +'<th class="n">Quoting</th><th class="n">Producing</th><th class="n">Value</th></tr></thead><tbody>'
            +repRows+'</tbody></table>'
          : '<p class="muted">No reps yet.</p>')
       +'<h2 style="margin-top:14px">Brokers referred</h2>'+brokerTable(mine)
       +'</div></div>';
   }).join('') || '<div class="card"><p class="muted">No partners yet. Add one above.</p></div>';

   var none=DATA.brokers.filter(function(b){return !b.partner_id});
   document.getElementById('unattributed').innerHTML = none.length
     ? '<table><thead><tr><th>Broker</th><th>Agency</th><th class="n">Quotes</th><th>Assign to</th></tr></thead><tbody>'
       + none.map(function(b){
           var opts=DATA.partners.map(function(p){
             var reps=DATA.contacts.filter(function(c){return c.partner_id===p.id});
             return reps.length
               ? reps.map(function(c){return '<option value="c:'+esc(c.id)+'">'+esc(p.name)+' — '+esc(c.name)+'</option>'}).join('')
                 +'<option value="p:'+esc(p.id)+'">'+esc(p.name)+' — rep not known</option>'
               : '<option value="p:'+esc(p.id)+'">'+esc(p.name)+' — rep not known</option>';
           }).join('');
           return '<tr><td>'+esc(b.name||b.email)+'</td><td>'+esc(b.agency||'—')+'</td>'
             +'<td class="n">'+b.quotes+'</td>'
             +'<td><select onchange="setRef(this)" data-b="'+esc(b.id)+'">'
             +'<option value="">— not referred —</option>'+opts+'</select></td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">Everyone has a referrer recorded.</p>';
 }

 async function addPartner(){
   var name=document.getElementById('pName').value.trim();
   var kind=document.getElementById('pKind').value.trim();
   var m=document.getElementById('pMsg');
   if(!name){ m.textContent='Name it first.'; return; }
   m.textContent='Saving…';
   var r=await fetch('/api/admin/referral-partner',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:name,kind:kind})});
   var d=await r.json().catch(function(){return{}});
   m.textContent = r.ok ? 'Added' : (d.error||'Could not add it');
   if(r.ok){ document.getElementById('pName').value=''; document.getElementById('pKind').value=''; load(); }
 }

 async function addContact(btn){
   var pid=btn.getAttribute('data-p');
   var name=document.querySelector('input.rn[data-p="'+pid+'"]').value.trim();
   var email=document.querySelector('input.re[data-p="'+pid+'"]').value.trim();
   if(!name) return;
   var r=await fetch('/api/admin/referral-contact',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({partnerId:pid,name:name,email:email})});
   if(r.ok) load(); else await failed(r,'Could not add that rep.');
 }

 // ⛔⛔ A FAILED SAVE MUST NOT LEAVE THE SCREEN SHOWING THE VALUE THAT DID NOT SAVE.
 // Both writes below used to read "if (r.ok) load();" with no else, so a 500 was completely
 // silent: the dropdown kept the rep you had just chosen while the database still held the old
 // one, and nothing on the page disagreed with you. On a page whose whole job is knowing which
 // rep to thank, a wrong answer that looks saved is the worst thing it can do.
 // ⭐ So it reloads FIRST -- putting the screen back to what the server actually has, which
 // reverts the control on its own -- and only then says why. The order matters: load() owns the
 // warning banner and would wipe a message written before it.
 async function failed(r, fallback){
   var d=await r.json().catch(function(){return{}});
   await load();
   var w=document.getElementById('warn');
   w.style.display='block';
   w.textContent=(d.error||fallback);
 }

 // ⚠️ The value carries WHICH KIND of assignment it is -- a rep or a partner-only -- so the server
 // is never asked to guess, and a partner is always derived from the rep when there is one.
 async function setRef(sel){
   var v=sel.value, body={brokerId:sel.getAttribute('data-b')};
   if(v.indexOf('c:')===0) body.contactId=v.slice(2);
   else if(v.indexOf('p:')===0) body.partnerId=v.slice(2);
   var r=await fetch('/api/admin/broker-referral',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(body)});
   if(r.ok) load(); else await failed(r,'Could not save that referral.');
 }

 load();
