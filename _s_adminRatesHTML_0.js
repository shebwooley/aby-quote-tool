
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 var P=(window.ABYQuote&&ABYQuote.pricing)||{};
 var st=document.getElementById('state');
 Object.keys(P).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=(k==='OUTSIDE'?'Outside Texas':k);st.appendChild(o)});
 function money(v){return (v==null||v==='')?'':('$'+v)}
 // ⭐ NAMES COME FROM products.js, THE SAME FILE THE QUOTE TOOL SHOWS BROKERS. The table read
 // "pop / docsOnly / section132" -- internal ids -- on the one page whose entire job is being
 // read easily. A second copy of the names here would drift; mapping through the registry cannot.
 // ⚠️ It falls back to the raw id when a product is priced but NOT registered, because that is a
 // real disagreement between the rate book and the product list, and worth seeing rather than
 // hiding behind a blank.
 function prodName(id){
   var list=(window.ABYQuote&&ABYQuote.products)||[];
   var p=list.filter(function(x){return x.id===id})[0];
   return p?(p.shortName||p.name||id):id;
 }
 function pkgName(pid,key){
   if(!key) return '';
   if(key==='additional fee') return 'Additional fee';
   var list=(window.ABYQuote&&ABYQuote.products)||[];
   var p=list.filter(function(x){return x.id===pid})[0];
   var pk=p&&p.packages?p.packages.filter(function(k){return k.id===key})[0]:null;
   return pk?(pk.name||key):key;
 }
 // Every priced thing, flattened to one row each. Used for BOTH the screen and the CSV, so what is
 // downloaded is what was displayed.
 function rows(state,book){
   var out=[], b=(P[state]||{})[book]||{};
   Object.keys(b).forEach(function(pid){
     var p=b[pid]; if(!p||typeof p!=='object') return;
     function tiers(list,pkg){(list||[]).forEach(function(t){
       out.push({product:pid,pkg:pkg||'',item:t.label||'',type:t.type||'',amount:t.amount,min:t.minMonthly,max:t.maxCount,setup:'',renewal:'',annual:''});
     })}
     if(p.monthlyTiers) tiers(p.monthlyTiers,'');
     if(p.packages) Object.keys(p.packages).forEach(function(k){
       var pk=p.packages[k];
       out.push({product:pid,pkg:k,item:pk.description||'',type:pk.formula?'formula':'package',
         amount:pk.formula?pk.formula.base:'',min:pk.formula?pk.formula.perForm:'',max:'',
         setup:pk.setupFee,renewal:pk.renewalFee,annual:pk.annualFee});
       if(pk.monthlyTiers) tiers(pk.monthlyTiers,k);
     });
     if(!p.monthlyTiers&&!p.packages) out.push({product:pid,pkg:'',item:p.description||'',type:p.type||'',amount:'',min:'',max:'',setup:p.setupFee,renewal:p.renewalFee,annual:p.annualFee});
     (p.additionalFees||[]).forEach(function(f){
       out.push({product:pid,pkg:'additional fee',item:f.label||'',type:f.unit||'',amount:f.amount,min:'',max:'',setup:'',renewal:'',annual:''});
     });
   });
   return out;
 }
 function draw(){
   var state=st.value, book=document.getElementById('book').value;
   document.getElementById('title').textContent='Rates — '+(state==='OUTSIDE'?'Outside Texas':state)+', '+(book==='commissioned'?'commissioned':'no commission');
   var r=rows(state,book);
   document.getElementById('out').innerHTML='<table><thead><tr><th>Product</th><th>Package</th><th>Item</th><th>Type</th><th class="n">Amount</th><th class="n">Min</th><th class="n">Max</th><th class="n">Setup</th><th class="n">Renewal</th><th class="n">Annual</th></tr></thead><tbody>'
     + r.map(function(x){return '<tr><td>'+esc(prodName(x.product))+'</td><td>'+esc(pkgName(x.product,x.pkg))+'</td><td>'+esc(x.item)+'</td><td>'+esc(x.type)+'</td><td class="n">'+esc(money(x.amount))+'</td><td class="n">'+esc(money(x.min))+'</td><td class="n">'+esc(x.max==null?'':x.max)+'</td><td class="n">'+esc(money(x.setup))+'</td><td class="n">'+esc(money(x.renewal))+'</td><td class="n">'+esc(money(x.annual))+'</td></tr>'}).join('')
     + '</tbody></table><p class="sub" style="margin-top:10px">'+r.length+' priced rows.</p>';
 }
 st.onchange=draw; document.getElementById('book').onchange=draw; draw();
 // 🔴 CSV INJECTION GUARD. A cell beginning = + - or @ is executed as a FORMULA by Excel when the
 // file is opened. These values are broker-facing product names, so the risk is real and the fix is
 // one apostrophe. This project has been bitten by exactly this before.
 function cell(v){
   var t=(v==null?'':String(v));
   if(/^[=+\-@\t\r]/.test(t)) t="'"+t;
   return '"'+t.replace(/"/g,'""')+'"';
 }
 document.getElementById('dl').onclick=function(e){
   e.preventDefault();
   var head=['state','book','product','package','item','type','amount','min','max','setup','renewal','annual'];
   var lines=[head.map(cell).join(',')];
   Object.keys(P).forEach(function(state){
     ['commissioned','noCommission'].forEach(function(book){
       rows(state,book).forEach(function(x){
         lines.push([state,book,x.product,x.pkg,x.item,x.type,x.amount,x.min,x.max,x.setup,x.renewal,x.annual].map(cell).join(','));
       });
     });
   });
   var blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
   var a=document.createElement('a');
   a.href=URL.createObjectURL(blob); a.download='aby-rates.csv'; a.click();
 };
