document.getElementById('cleanBtn').addEventListener('click',async()=>{
  const text=document.getElementById('paste').value;
  const r=await fetch('/api/clean',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  const j=await r.json(); document.getElementById('cleaned').value=j.cleaned||'';
});