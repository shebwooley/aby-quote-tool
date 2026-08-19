
 var $=function(id){return document.getElementById(id)}, mode='in', logoData='';
 function show(el,text,cls){el.textContent=text;el.className='msg '+cls;el.style.display='block'}
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 $('tabIn').onclick=function(){mode='in';$('tabIn').className='on';$('tabUp').className='';$('upOnly').style.display='none';$('authTitle').textContent='Sign in';$('go').textContent='Sign in';$('sPass').autocomplete='current-password';$('authMsg').style.display='none'};
 $('tabUp').onclick=function(){mode='up';$('tabUp').className='on';$('tabIn').className='';$('upOnly').style.display='block';$('authTitle').textContent='Create an account';$('go').textContent='Create account';$('sPass').autocomplete='new-password';$('authMsg').style.display='none'};
 $('go').onclick=async function(){
   var body={email:$('sEmail').value,password:$('sPass').value};
   if(mode==='up'){body.name=$('sName').value;body.agency=$('sAgency').value;body.phone=$('sPhone').value}
   var r=await fetch('/api/broker/'+(mode==='up'?'signup':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show($('authMsg'),d.error||'Something went wrong.','err');return}
   enter(d.broker);
 };
 $('out').onclick=async function(){await fetch('/api/broker/logout',{method:'POST'});location.reload()};
 $('pLogo').onchange=function(){
   var f=this.files[0]; if(!f) return;
   var rd=new FileReader(); rd.onload=function(){logoData=rd.result;$('logoPrev').src=logoData;$('logoPrev').style.display='block'};
   rd.readAsDataURL(f);
 };
 $('save').onclick=async function(){
   var r=await fetch('/api/broker/profile',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:$('pName').value,agency:$('pAgency').value,phone:$('pPhone').value,logoDataUrl:logoData})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show($('saveMsg'),d.error||'Could not save.','err');return}
   show($('saveMsg'),'Saved. These will fill in on your next quote.','ok');
 };
 $('forgot').onclick=async function(e){
   e.preventDefault();
   if(!$('sEmail').value){show($('authMsg'),'Enter your email address first, then click again.','err');return}
   var r=await fetch('/api/broker/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('sEmail').value})});
   var d=await r.json().catch(function(){return{}});
   show($('authMsg'),d.message||'If there is an account for that address, a link is on its way.','ok');
 };
 var agencyLogoData='', meEmail='';
 $('aLogo').onchange=function(){
   var f=this.files[0]; if(!f) return;
   var rd=new FileReader(); rd.onload=function(){agencyLogoData=rd.result;$('aLogoPrev').src=agencyLogoData;$('aLogoPrev').style.display='block'};
   rd.readAsDataURL(f);
 };
 $('aSave').onclick=async function(){
   var r=await fetch('/api/agency/settings',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:$('aName').value,logoDataUrl:agencyLogoData,shareQuotes:$('aShare').checked})});
   var d=await r.json().catch(function(){return{}});
   show($('aMsg'),r.ok?'Saved.':(d.error||'Could not save.'),r.ok?'ok':'err');
 };
 $('inviteGo').onclick=async function(){
   // 🔴🔴 A LINE THAT DID NOT PARSE USED TO VANISH WITHOUT A WORD, AND THE BOX WAS THEN CLEARED.
   // The old rule was "no comma, no person": a bare email address -- the single most likely thing
   // to be pasted out of a spreadsheet -- was dropped on the floor. Paste five people with two
   // bare emails among them and only three were invited, the confirmation counted only those
   // three without mentioning the other two, and the textarea was wiped, so the evidence went too.
   // ⭐ THE SERVER ONLY EVER REQUIRED AN EMAIL -- the name is optional there -- so a bare address
   // is now a perfectly good line, and that person simply arrives without a name.
   // ⭐ Anything with no at-sign at all BLOCKS THE SEND and is named back. Blocking beats sending
   // the good ones, because a partial send is the silent failure wearing a friendlier face, and
   // the box is left untouched so the typo can be fixed in place.
   // ⚠️ String.fromCharCode rather than a backslash-n regex: this page is a template literal and
   // it EATS lone backslashes (TRAPS #224).
   var people=[], unusable=[];
   $('inviteBox').value.split(String.fromCharCode(10)).forEach(function(raw){
     var l=raw.split(String.fromCharCode(13)).join('').trim();
     if(!l) return;
     var parts=l.split(',');
     var email=parts[parts.length-1].trim();
     // Trim each part BEFORE joining, or "Smith, Jane, x@y.com" arrives as "Smith  Jane"
     // with a double space -- the join happens between already-spaced fragments.
     var name=(parts.length>1)
       ? parts.slice(0,-1).map(function(s){return s.trim()}).filter(Boolean).join(' ')
       : '';
     if(email.indexOf('@')<0){ unusable.push(l); return; }
     people.push({name:name, email:email});
   });
   if(unusable.length){
     show($('inviteMsg'),'Nothing was sent. These lines have no email address in them: '
       +unusable.join(' · ')+'. Fix or remove them and try again.','err');
     return;
   }
   if(!people.length){show($('inviteMsg'),'Add at least one line. A name and email, or just an email.','err');return}
   $('inviteGo').disabled=true;$('inviteGo').textContent='Sending...';
   var r=await fetch('/api/agency/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({people:people})});
   var d=await r.json().catch(function(){return{}});
   $('inviteGo').disabled=false;$('inviteGo').textContent='Send invitations';
   if(!r.ok){show($('inviteMsg'),d.error||'Could not send.','err');return}
   var bits=[];
   if(d.invited.length) bits.push(d.invited.length+' invited');
   if(d.skipped.length) bits.push(d.skipped.length+' skipped ('+d.skipped.map(function(x){return x.email+' - '+x.why}).join('; ')+')');
   if(d.failed.length)  bits.push(d.failed.length+' failed ('+d.failed.map(function(x){return x.email+' - '+x.why}).join('; ')+')');
   show($('inviteMsg'),bits.join('. '),d.failed.length?'err':'ok');
   $('inviteBox').value=''; loadAgency();
 };
 async function setRole(email,role){
   var r=await fetch('/api/agency/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,role:role})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show($('inviteMsg'),d.error||'Could not change that.','err');return}
   loadAgency();
 }
 async function loadAgency(){
   var r=await fetch('/api/agency/me'); var d=await r.json().catch(function(){return{}});
   if(!d||!d.agency) return;
   $('aName').value=d.agency.name||''; $('aShare').checked=!!d.agency.shareQuotes;
   if(d.agency.logoDataUrl){agencyLogoData=d.agency.logoDataUrl;$('aLogoPrev').src=agencyLogoData;$('aLogoPrev').style.display='block'}
   var rows=(d.members||[]).map(function(m){
     var other=m.email!==meEmail;
     var btn=other?'<button style="font-size:12px;padding:4px 9px;border:1px solid #c8d2de;background:#fff;border-radius:5px;cursor:pointer" data-e="'+esc(m.email)+'" data-r="'+(m.role==='admin'?'member':'admin')+'">'+(m.role==='admin'?'Make member':'Make admin')+'</button>':'<span class="muted">you</span>';
     return '<tr><td>'+esc(m.name||'-')+'</td><td>'+esc(m.email)+'</td><td>'+esc(m.role||'member')+'</td><td>'+(m.pending?'<span class="muted">invited, not signed in yet</span>':'active')+'</td><td>'+btn+'</td></tr>';
   }).join('');
   $('memberList').innerHTML='<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
   Array.prototype.forEach.call($('memberList').querySelectorAll('button[data-e]'),function(b){
     b.onclick=function(){setRole(b.getAttribute('data-e'),b.getAttribute('data-r'))};
   });
 }
 $('tabMine').onclick=function(){$('tabMine').className='on';$('tabAgency').className='';$('quotesSub').textContent='Every quote run under your email address.';loadQuotes('/api/broker/quotes')};
 $('tabAgency').onclick=function(){$('tabAgency').className='on';$('tabMine').className='';$('quotesSub').textContent='Every quote run by anyone in your agency.';loadQuotes('/api/agency/quotes')};
 function enter(b){
   meEmail=b.email||'';
   $('authCard').style.display='none';$('appArea').style.display='block';$('out').style.display='inline-block';
   $('pName').value=b.name||'';$('pAgency').value=b.agency||'';$('pPhone').value=b.phone||'';
   if(b.logoDataUrl){logoData=b.logoDataUrl;$('logoPrev').src=logoData;$('logoPrev').style.display='block'}
   if(b.role==='admin'){$('agencyCard').style.display='block';$('inviteCard').style.display='block';loadAgency()}
   loadQuotes();
 }
 async function loadQuotes(url){
   var r=await fetch(url||'/api/broker/quotes'); var d=await r.json().catch(function(){return{}});
   var q=(d.quotes)||[];
   if(!q.length){
     var why=d.reason==='not-shared'?'Your agency administrator has not turned on shared quotes.'
       :d.reason==='no-agency'?'You are not part of an agency yet.'
       :'No quotes yet. Ones you run while signed in will appear here.';
     $('quotes').innerHTML='<p class="muted">'+why+'</p>';return}
   var rows=q.map(function(x){
     return '<tr><td>'+esc((x.created_at||'').slice(0,10))+'</td><td>'+esc(x.client_name||'—')+'</td><td>'+esc(x.broker_name||x.broker_email||'—')+'</td><td>'+esc(x.quote_number||'')+'</td><td>'+esc(x.state||'')+'</td></tr>';
   }).join('');
   $('quotes').innerHTML='<table><thead><tr><th>Date</th><th>Client</th><th>Run by</th><th>Quote number</th><th>State</th></tr></thead><tbody>'+rows+'</tbody></table>';
 }
 (async function(){
   var r=await fetch('/api/broker/me'); var d=await r.json().catch(function(){return{}});
   if(d && d.broker) enter(d.broker);
 })();
