
 var $=function(i){return document.getElementById(i)};
 function show(t,c){var m=$('m');m.textContent=t;m.className='msg '+c;m.style.display='block'}
 var token=new URLSearchParams(location.search).get('token')||'';
 if(!token) show('That link is missing its code. Ask for a new one.','err');
 $('go').onclick=async function(){
   if($('p1').value!==$('p2').value){show('Those two passwords do not match.','err');return}
   var r=await fetch('/api/broker/set-password',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({token:token,password:$('p1').value})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show(d.error||'Could not set your password.','err');return}
   show('Done. Taking you to your account...','ok');
   setTimeout(function(){location.href='/broker'},900);
 };
