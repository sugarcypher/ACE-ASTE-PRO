document.getElementById('cleanBtn').addEventListener('click',()=>{
  const text=document.getElementById('paste').value;
  const re=/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
  const cleaned=text.replace(re,'');
  document.getElementById('cleaned').value=cleaned;
});