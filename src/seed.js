import { addDays, clamp, diffDays, parseISO, today, uid, weekStart } from "./core.js";
import { COLS, DEFAULT_CONFIG, Store, audit } from "./data.js";
import { scoreAssessment } from "./domain/scoring.js";
import { sessionLoad } from "./domain/workload.js";
import { t } from "./i18n/index.js";
import { render } from "./main.js";
import { toast } from "./ui/feedback.js";
import { threadId } from "./views/library.js";
/* ================================================================
   22. DEMONSTRATION DATASET
   ================================================================ */
async function seedDemo(){
  if (Store.list("users").some(u => u.demo)){ toast(t("g.saved")); return; }
  toast(t("g.loading"));
  const T = today();
  const mk = (o) => Object.assign({ demo: true, status: "active", plan: "pro", createdAt: Date.now() }, o);
  const coach = mk({ id:"u-coach-demo", name:"Camille Roussel", email:"camille@altaris.demo", role:"coach", pin:"1111",
                     profile:{ lastActive: Date.now() } });
  const A = mk({ id:"u-ath-1", name:"Nils Berger", email:"nils@altaris.demo", role:"climber", pin:"2222", coachId: coach.id,
    profile:{ sex:"m", birthYear:1996, heightCm:178, weightKg:68.5, years:9, gradeSport:"8a", gradeBoulder:"7C",
      discipline:"both", injuries:["pulley","elbow"], availability:[
        {day:0,start:"18:00",end:"20:30",type:"boulder"},{day:2,start:"12:00",end:"14:00",type:"fingerboard"},
        {day:4,start:"18:00",end:"20:30",type:"endurance"},{day:5,start:"09:00",end:"17:00",type:"outdoor"}],
      goalText:"Enchaîner un 8a+ à Céüse avant la fin de l'été", goalDate: addDays(T, 120), onboarded:true, lastActive: Date.now() - 3600000 } });
  const B = mk({ id:"u-ath-2", name:"Léa Fontaine", email:"lea@altaris.demo", role:"climber", pin:"3333", coachId: coach.id,
    profile:{ sex:"f", birthYear:2001, heightCm:165, weightKg:54.0, years:4, gradeSport:"7a+", gradeBoulder:"7A",
      discipline:"boulder", injuries:["shoulder"], availability:[
        {day:1,start:"19:00",end:"21:00",type:"boulder"},{day:3,start:"19:00",end:"21:00",type:"strength"},
        {day:6,start:"10:00",end:"12:30",type:"boulder"}],
      goalText:"Passer le cap du 7B en bloc et stabiliser l'épaule droite", goalDate: addDays(T, 90), onboarded:true, lastActive: Date.now() - 86400000*2 } });
  const C = mk({ id:"u-ath-3", name:"Tom Vasseur", email:"tom@altaris.demo", role:"climber", pin:"4444", coachId: coach.id,
    profile:{ sex:"m", birthYear:2004, heightCm:182, weightKg:74.2, years:1.5, gradeSport:"6b", gradeBoulder:"6B",
      discipline:"boulder", injuries:[], availability:[
        {day:1,start:"18:30",end:"20:30",type:"boulder"},{day:4,start:"18:30",end:"20:30",type:"mobility"}],
      goalText:"Grimper 6c en falaise cet automne", goalDate: addDays(T, 150), onboarded:true, lastActive: Date.now() - 86400000 } });

  await Store.put("users", coach.id, coach);
  await Store.put("users", A.id, A);
  await Store.put("users", B.id, B);
  await Store.put("users", C.id, C);

  /* --- assessments --- */
  const mkA = (u, date, battery, results) => {
    const a = { id: uid("a"), userId: u.id, date, battery, results, status:"complete", createdBy: coach.id, demo:true };
    a.scores = scoreAssessment(a, u.profile);
    return a;
  };
  const A1 = mkA(A, addDays(T,-96), "advanced", {
    finger:{bw:68.5, added:19.0}, repeat:{load:6, reps:26}, pull:{bw:68.5, added:29},
    power:{height:"sternum"}, core:{variant:"straddle", secs:9, stable:4}, mob:{spread:118, height:178, erot:92} });
  const A2 = mkA(A, addDays(T,-12), "advanced", {
    finger:{bw:68.0, added:24.5}, repeat:{load:8, reps:31}, pull:{bw:68.0, added:34},
    power:{height:"nipple"}, core:{variant:"straddle", secs:14, stable:4}, mob:{spread:124, height:178, erot:96} });
  const B1 = mkA(B, addDays(T,-70), "advanced", {
    finger:{bw:54.0, added:6.5}, repeat:{load:2, reps:19}, pull:{bw:54.0, added:14},
    power:{height:"throat"}, core:{variant:"advtuck", secs:11, stable:3}, mob:{spread:128, height:165, erot:104} });
  const B2 = mkA(B, addDays(T,-8), "advanced", {
    finger:{bw:54.4, added:9.0}, repeat:{load:3, reps:24}, pull:{bw:54.4, added:18},
    power:{height:"sternum"}, core:{variant:"advtuck", secs:16, stable:4}, mob:{spread:132, height:165, erot:108} });
  const C1 = mkA(C, addDays(T,-30), "beginner", {
    vol:{sessions:2, avgMin:105, months:18}, eff:{clean:11, moveS:118, totalS:240},
    joint:{episodes:0, hangS:14, discomfort:1}, basemob:{spread:104, height:182, shoulder:7, ankle:8.5},
    baseend:{minutes:4.5}, basecore:{hollow:32, raises:9} });
  for (const a of [A1, A2, B1, B2, C1]) await Store.put("assessments", a.id, a);

  /* --- ten weeks of sessions, shaped so the analytics have something to say --- */
  const PLANS = {
    "u-ath-1": [[0,"boulder","Bloc limite + volume",110,8],[2,"fingerboard","Poutre max hangs + repeaters",70,9],
                [4,"endurance","Continuité 4×4",100,7],[5,"outdoor","Falaise — projet",300,6]],
    "u-ath-2": [[1,"boulder","Volume bloc + technique",110,6],[3,"strength","Force générale + préhab épaule",75,7],
                [6,"boulder","Séance projet",130,8]],
    "u-ath-3": [[1,"boulder","Découverte volume + pieds silencieux",110,5],[4,"mobility","Mobilité & gainage",60,4]]
  };
  const rnd = (seed) => { let x = Math.sin(seed) * 10000; return x - Math.floor(x); };
  let seed = 7;
  for (const uid_ of Object.keys(PLANS)){
    for (let w = 9; w >= 0; w--){
      const ws = addDays(weekStart(T), -w * 7);
      PLANS[uid_].forEach(([dow, type, title, mins, inten], k) => {
        const date = addDays(ws, dow);
        if (diffDays(date, T) > 6) return;
        seed += 1.7;
        const r = rnd(seed);
        const past = diffDays(T, date) > 0;
        const s = { id:"s-" + uid_ + "-" + w + "-" + k, userId: uid_, coachId: coach.id, date, title, type,
          plannedMin: mins, targetIntensity: inten, notes: "", exercises: [], demo:true, status: past ? "done" : "planned" };
        if (past){
          if (r < 0.09){ s.status = "missed"; }
          else {
            /* Nils ramps hard in the last fortnight — the ACWR panel should show it. */
            const ramp = (uid_ === "u-ath-1" && w <= 1) ? 1.62 : (uid_ === "u-ath-1" && w >= 5) ? 0.74 : 1;
            const rpe = clamp(Math.round(inten + (r - .5) * 2.4), 1, 10);
            const dur = Math.round(mins * (0.85 + r * 0.3) * ramp / 5) * 5;
            s.rpe = rpe; s.actualMin = dur; s.load = sessionLoad(rpe, dur);
            s.feedback = r > .7 ? "Bonnes sensations, pas de gêne." : "";
            s.doneAt = parseISO(date).getTime();
          }
        }
        Store.data.sessions[s.id] = s;
      });
    }
  }
  const EXMAP = { boulder:["bd-onsight","bd-silent","pw-limit"], fingerboard:["fg-maxhang","fg-repeaters","ph-scap"],
    endurance:["en-4x4","en-arc"], strength:["pw-wpull","cr-fl","ph-erot"], mobility:["mb-frog","mb-ankle","cr-hollow"],
    outdoor:["bd-onsight"], prehab:["ph-erot","ph-ytw","ph-tyler"], lead:["en-laps"], rest:[] };
  for (const s of Object.values(Store.data.sessions)){ if (s.demo) s.exercises = EXMAP[s.type] || []; }
  const rows = Object.values(Store.data.sessions).filter(s => s.demo);
  Store.silent = true;
  for (let i = 0; i < rows.length; i += 8){
    await Promise.all(rows.slice(i, i + 8).map(s => Store.put("sessions", s.id, s)));
  }
  Store.silent = false;
  render();

  /* --- pain reports --- */
  const p1 = { id:"p-demo-1", userId:B.id, date: addDays(T,-4), location:"shoulder", eva:4, onset:"during",
    context:"Gêne en fin d'amplitude sur les mouvements bras haut, épaule droite.", status:"active", createdAt: Date.now()-4*86400000, demo:true };
  const p2 = { id:"p-demo-2", userId:A.id, date: addDays(T,-38), location:"elbow_med", eva:3, onset:"after",
    context:"Après une grosse séance de poutre, résolu avec du travail excentrique.", status:"resolved", createdAt: Date.now()-38*86400000, demo:true };
  await Store.put("pain", p1.id, p1); await Store.put("pain", p2.id, p2);

  /* --- conversations --- */
  const th1 = { id: threadId(coach.id, A.id), participants:[coach.id, A.id], demo:true, read:{}, updatedAt: Date.now(),
    messages:[
      { id:uid("m"), from:coach.id, ts: Date.now()-5*86400000, text:"Nils, la montée de charge des deux dernières semaines est nette. On garde le volume mais je baisse l'intensité de la poutre jeudi." },
      { id:uid("m"), from:A.id, ts: Date.now()-5*86400000+3600000, text:"Ok. Le coude tient bien depuis que j'ai repris les excentriques. Je te mets la vidéo du crux du projet." ,
        videoUrl:"https://vimeo.com/", ctx:"Falaise — projet" },
      { id:uid("m"), from:coach.id, ts: Date.now()-4*86400000, text:"Vu. Tu pars trop tôt sur la main droite : cale le bassin à gauche avant de lâcher, tu gagneras 10 cm d'allonge." }
    ]};
  const th2 = { id: threadId(coach.id, B.id), participants:[coach.id, B.id], demo:true, read:{}, updatedAt: Date.now(),
    messages:[
      { id:uid("m"), from:B.id, ts: Date.now()-4*86400000, ctx:"Journal de douleur", text:"Épaule · EVA 4/10 · Pendant l'effort\nGêne en fin d'amplitude sur les mouvements bras haut." },
      { id:uid("m"), from:coach.id, ts: Date.now()-4*86400000+7200000, text:"Bien noté. On sort les mouvements bras haut cette semaine et on ajoute rotations externes + Y-T-W trois fois par semaine. On refait le point vendredi." }
    ]};
  await Store.put("threads", th1.id, th1); await Store.put("threads", th2.id, th2);

  /* --- a coach routine --- */
  await Store.put("routines", "r-demo-1", { id:"r-demo-1", coachId: coach.id, name:"Poutre — force max", type:"fingerboard",
    durationMin:70, exerciseIds:["ph-scap","fg-maxhang","fg-repeaters","ph-fingerext"], notes:"Échauffement 15 min obligatoire.", demo:true });
  await Store.put("config", "global", DEFAULT_CONFIG);
  audit("demo_seeded", "4 accounts");
  toast(t("g.saved"), "good");
}

async function purgeDemo(){
  for (const col of COLS){
    for (const row of Store.list(col)) if (row.demo) await Store.del(col, row.id);
  }
  audit("demo_purged", "");
  toast(t("g.deleted"), "good");
}

export { purgeDemo, seedDemo };
