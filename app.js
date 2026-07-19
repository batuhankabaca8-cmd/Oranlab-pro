(function () {
  const form=document.getElementById('analysisForm');
  const clearButton=document.getElementById('clearButton');
  const themeButton=document.getElementById('themeButton');
  const tableSearch=document.getElementById('tableSearch');
  const statusText=document.querySelector('.hero-status small');

  if (localStorage.getItem('oranlab-theme')==='light') { document.body.classList.add('light-theme'); themeButton.textContent='☀'; }
  themeButton.addEventListener('click',()=>{ document.body.classList.toggle('light-theme'); const light=document.body.classList.contains('light-theme'); localStorage.setItem('oranlab-theme',light?'light':'dark'); themeButton.textContent=light?'☀':'☾'; });
  fetch('/api/status').then((r)=>r.json()).then((data)=>{ statusText.textContent=`${data.records.toLocaleString('tr-TR')} maç kaydı aktif · v${data.version}`; }).catch(()=>{ statusText.textContent='Sunucu bağlantısı bekleniyor'; });

  clearButton.addEventListener('click',()=>{ form.reset(); document.querySelector('input[name="matchType"][value="partial"]').checked=true; document.getElementById('tolerance').value='0.10'; document.getElementById('limit').value='100'; tableSearch.value=''; OranlabUI.resetStats(); OranlabUI.showEmptyState(); OranlabUI.showToast('Form temizlendi.'); });
  form.addEventListener('submit',async(event)=>{
    event.preventDefault(); const params=new URLSearchParams(new FormData(form));
    if (![params.get('ms1'),params.get('msx'),params.get('ms2'),params.get('barem')].some(Boolean)) return OranlabUI.showToast('En az bir oran alanı doldurmalısın.');
    try {
      OranlabUI.setLoading(true); OranlabUI.showEmptyState('Veriler taranıyor','Benzer maçlar ve istatistikler hesaplanıyor.');
      const response=await fetch(`/api/search?${params.toString()}`); const data=await response.json();
      if (!response.ok) throw new Error(data.error || 'Arama başarısız.');
      OranlabUI.updateStats(data); OranlabUI.renderRows(data.rows); OranlabUI.showToast(`${data.total.toLocaleString('tr-TR')} eşleşme bulundu.`);
    } catch(error) { OranlabUI.resetStats(); OranlabUI.showEmptyState('Bağlantı kurulamadı',error.message); OranlabUI.showToast(error.message); }
    finally { OranlabUI.setLoading(false); }
  });
  tableSearch.addEventListener('input',()=>{ const query=tableSearch.value.toLocaleLowerCase('tr-TR'); document.querySelectorAll('#tableBody tr:not(.empty-row)').forEach((row)=>{ row.hidden=!row.textContent.toLocaleLowerCase('tr-TR').includes(query); }); });
})();
