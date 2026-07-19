(function () {
  const toast=document.getElementById('toast'); let toastTimer;
  const safe=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const set=(id,value)=>{ const el=document.getElementById(id); if(el) el.textContent=value; };
  window.OranlabUI={
    showToast(message){ clearTimeout(toastTimer); toast.textContent=message; toast.classList.add('show'); toastTimer=setTimeout(()=>toast.classList.remove('show'),2600); },
    setLoading(active){ const button=document.querySelector('.primary-button'); button.disabled=active; button.classList.toggle('loading',active); button.querySelector('span').textContent=active?'Hesaplanıyor...':'Analiz Et'; },
    resetStats(){ ['statMs1','statMsx','statMs2','statIy05','statMs15','statMs25','statKg','statHomeGoal','statAwayGoal'].forEach(id=>set(id,'--%')); ['statAvgGoals','statAvgHalfGoals'].forEach(id=>set(id,'--')); set('resultCount','0 eşleşme'); set('confidenceValue','--'); set('sampleInfo','Analiz sonrası örneklem bilgisi gösterilir.'); document.getElementById('confidenceBar').style.width='0%'; document.getElementById('scorePodium').innerHTML='<div><span>1</span><strong>--</strong><small>--%</small></div><div><span>2</span><strong>--</strong><small>--%</small></div><div><span>3</span><strong>--</strong><small>--%</small></div>'; this.resetCharts(); },
    updateStats(data){ const s=data.stats; set('statMs1',`${s.ms1}%`); set('statMsx',`${s.msx}%`); set('statMs2',`${s.ms2}%`); set('statIy05',`${s.iy05}%`); set('statMs15',`${s.ms15}%`); set('statMs25',`${s.ms25}%`); set('statKg',`${s.kg}%`); set('statHomeGoal',`${s.homeGoal}%`); set('statAwayGoal',`${s.awayGoal}%`); set('statAvgGoals',s.avgGoals); set('statAvgHalfGoals',s.avgHalfGoals); set('resultCount',`${data.total.toLocaleString('tr-TR')} eşleşme · ${data.shown} gösteriliyor`); set('confidenceValue',data.confidence); set('sampleInfo',`${data.sampleSize.toLocaleString('tr-TR')} maçlık örneklem üzerinden hesaplandı.`); document.getElementById('confidenceBar').style.width=`${data.confidence}%`; const top=[...(data.topScores||[])]; while(top.length<3) top.push({score:'--',percentage:0}); document.getElementById('scorePodium').innerHTML=top.slice(0,3).map((x,i)=>`<div><span>${i+1}</span><strong>${safe(x.score)}</strong><small>%${safe(x.percentage)}</small></div>`).join(''); this.updateCharts(data); },

    resetCharts(){
      const donut=document.getElementById('outcomeDonut'); if(donut) donut.style.background='conic-gradient(var(--border) 0 100%)';
      set('donutCenter','--'); set('legendMs1','--%'); set('legendMsx','--%'); set('legendMs2','--%');
      document.querySelectorAll('#goalBars .bar-row').forEach(row=>{ row.querySelector('i').style.width='0%'; row.querySelector('strong').textContent='--%'; });
      const leagues=document.getElementById('leagueBars'); if(leagues) leagues.innerHTML='<div class="chart-empty">Analiz sonrası gösterilir.</div>';
    },
    updateCharts(data){
      const s=data.stats||{}; const a=Number(s.ms1)||0; const b=Number(s.msx)||0; const c=Number(s.ms2)||0;
      const donut=document.getElementById('outcomeDonut');
      if(donut) donut.style.background=`conic-gradient(var(--primary) 0 ${a}%, var(--secondary) ${a}% ${a+b}%, var(--danger) ${a+b}% 100%)`;
      set('donutCenter',Number(data.sampleSize||0).toLocaleString('tr-TR')); set('legendMs1',`${a}%`); set('legendMsx',`${b}%`); set('legendMs2',`${c}%`);
      const dist=data.goalDistribution||{}; const values=[dist.low||0,dist.two||0,dist.three||0,dist.high||0];
      document.querySelectorAll('#goalBars .bar-row').forEach((row,i)=>{ row.querySelector('i').style.width=`${values[i]}%`; row.querySelector('strong').textContent=`${values[i]}%`; });
      const leagues=document.getElementById('leagueBars'); const items=data.topLeagues||[];
      leagues.innerHTML=items.length?items.map(x=>`<div class="league-row"><div><span>${safe(x.league)}</span><strong>${Number(x.count||0).toLocaleString('tr-TR')}</strong></div><div class="league-track"><i style="width:${Math.max(3,Number(x.percentage)||0)}%"></i></div></div>`).join(''):'<div class="chart-empty">Lig verisi bulunamadı.</div>';
    },
    renderRows(rows){ const body=document.getElementById('tableBody'); if(!rows.length)return this.showEmptyState('Eşleşen maç bulunamadı','Farklı değer veya tolerans deneyebilirsin.'); body.innerHTML=rows.map(row=>`<tr><td><strong>${safe(row.league||'-')}</strong><small class="cell-meta">${safe(row.year||'')} ${safe(row.match_time||'')}</small></td><td>${safe(row.home||'-')}</td><td>${safe(row.away||'-')}</td><td><span class="score-badge">${safe(row.half_score||'-')}</span></td><td><span class="score-badge final-score">${safe(row.full_score||'-')}</span></td><td><span class="similarity-badge">%${safe(row.similarity)}</span><small class="cell-meta">${safe(row.ms1)} · ${safe(row.msx)} · ${safe(row.ms2)} | ${safe(row.barrier||'-')}</small></td></tr>`).join(''); },
    showEmptyState(message='Henüz analiz yapılmadı',detail='Yukarıdaki alanları doldurup “Analiz Et” butonuna bas.'){ document.getElementById('tableBody').innerHTML=`<tr class="empty-row"><td colspan="6"><div class="empty-state"><span>⌁</span><strong>${safe(message)}</strong><small>${safe(detail)}</small></div></td></tr>`; }
  };
})();
