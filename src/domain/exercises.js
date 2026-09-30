import { Store, audit } from "../data.js";
import { LI } from "../i18n/index.js";
/* ================================================================
   5. ALTARIS EXERCISE BANK — bilingual reference library
   Fields are "FR|EN". lv: all / inter / adv (minimum level)
   ================================================================ */
const EX_CATS = ["doigts","tirage","poussee","gainage","antagonistes","pliometrie","endurance",
                 "mobilite","equilibre","vitesse","echauffement","recuperation"];

/* Exercices de cette banque remplacés par un équivalent de la base v2
   (supabase/migrations/…_exercise_bank_v2.sql). Ils ne sont plus publiés,
   mais une séance déjà planifiée avec l'ancien id retrouve le nouveau. */
const REPLACED = {
  "fg-maxhang":"fd03", "fg-repeaters":"fd02", "fg-pinch":"fd04", "fg-jug":"fd01", "ph-passive":"fd01",
  "pw-campus":"fd05", "pw-dyno":"pl01", "pw-explopull":"ft07", "pw-jumpsquat":"pl03",
  "en-4x4":"en02", "en-arc":"en01", "en-laps":"en03", "en-circuit":"en06",
  "bd-silent":"eq01", "bd-downclimb":"en07",
  "mb-frog":"mo02", "mb-split":"mo03", "mb-ankle":"mo07",
  "cr-hollow":"ga03", "cr-fl":"ft05", "cr-legraise":"ga04", "cr-sideplank":"ga02", "cr-dragon":"ga05",
  "ph-erot":"an01", "ph-ytw":"an03", "ph-tyler":"an07", "ph-wrist":"an04", "ph-serratus":"an05"
};
/* Anciennes catégories → catégories v2 ; quelques exercices sont reclassés un par un. */
const CAT_V2 = { finger:"doigts", power:"pliometrie", endur:"endurance", boulder:"equilibre",
                 mobility:"mobilite", core:"gainage", prehab:"antagonistes" };
const CAT_V2_BY_ID = { "pw-wpull":"tirage" };

const _X = [];
function X(id,cat,lv,n,d,m,c,e,dose,contra){ _X.push({id,cat:CAT_V2_BY_ID[id]||CAT_V2[cat],lv,n,d,m,c,e,dose,contra}); }

/* ---------- Force doigts ---------- */
X("fg-maxhang","finger","adv",
"Suspensions maximales 20 mm|Max hangs, 20 mm edge",
"Suspension de 7 à 10 s en demi-arqué sur réglette 20 mm, lestée jusqu'à l'échec théorique à la fin de la série.|7 to 10 s half-crimp hang on a 20 mm edge, loaded so the last rep of the set is close to failure.",
"Fléchisseurs profonds et superficiels des doigts, poulies A2-A4, avant-bras|Deep and superficial finger flexors, A2-A4 pulleys, forearms",
"Épaules actives, coudes légèrement fléchis. Demi-arqué strict, pouce libre. Respiration continue pendant la suspension.|Active shoulders, elbows slightly bent. Strict half-crimp, thumb off. Keep breathing through the hang.",
"Arqué fermé sous charge, épaules passives en suspension totale, séries enchaînées sans les 3 min de repos.|Full crimp under load, passive shoulders in a dead hang, sets run together without the 3 min rest.",
"4 à 6 séries de 7-10 s, 3 min de repos. 2 séances par semaine, jamais deux jours de suite.|4 to 6 sets of 7-10 s, 3 min rest. 2 sessions per week, never on consecutive days.",
"Toute douleur de poulie, tendinopathie de coude en phase aiguë, moins de 2 ans de pratique régulière.|Any pulley pain, acute elbow tendinopathy, less than 2 years of regular practice.");

X("fg-repeaters","finger","inter",
"Repeaters 7/3|Repeaters 7/3",
"Cycles de 7 s d'effort et 3 s de repos, 6 répétitions par série, à environ 60 % de la charge maximale.|Cycles of 7 s work and 3 s rest, 6 reps per set, at roughly 60% of maximum load.",
"Endurance de force des fléchisseurs, capacité oxydative locale de l'avant-bras|Finger flexor strength-endurance, local forearm oxidative capacity",
"Reposez les pieds au sol entre les répétitions plutôt que de lâcher brutalement. Gardez la même préhension du début à la fin.|Touch down between reps rather than dropping off. Keep the same grip position from first rep to last.",
"Monter la charge jusqu'à échouer avant la 5e répétition, ce qui en fait un test de force et non d'endurance.|Loading so heavily you fail before the 5th rep, which turns it into a strength test rather than an endurance one.",
"3 à 5 séries de 6 répétitions, 2 à 3 min entre les séries. 1 à 2 fois par semaine.|3 to 5 sets of 6 reps, 2 to 3 min between sets. 1 to 2 times per week.",
"Douleur de poulie, retour de blessure de moins de 6 semaines.|Pulley pain, return from injury less than 6 weeks ago.");

X("fg-oneassist","finger","adv",
"Suspension à un bras assistée|Assisted one-arm hang",
"Suspension unilatérale sur réglette 20 mm avec allègement à la poulie ou à l'élastique, pour développer la force unilatérale sans surcharge.|Single-arm hang on a 20 mm edge with pulley or band assistance, building unilateral strength without overload.",
"Fléchisseurs des doigts en unilatéral, coiffe des rotateurs, chaîne scapulaire|Unilateral finger flexors, rotator cuff, scapular chain",
"Épaule engagée vers le bas et l'arrière. Le bassin reste sous la main, pas de rotation du tronc.|Shoulder engaged down and back. Hips stay under the hand, no trunk rotation.",
"Laisser l'épaule remonter dans l'oreille, compenser par une rotation du corps.|Letting the shoulder shrug into the ear, compensating with body rotation.",
"5 séries de 7 s par bras, 2 min de repos. Réduire l'assistance de 2 kg toutes les 2 à 3 semaines.|5 sets of 7 s per arm, 2 min rest. Reduce assistance by 2 kg every 2 to 3 weeks.",
"Instabilité d'épaule, moins de 130 % du poids de corps en suspension à deux bras.|Shoulder instability, less than 130% body weight on a two-arm hang.");

X("fg-density","finger","inter",
"Suspensions de densité 30 s|Density hangs, 30 s",
"Suspensions longues à charge légère sur prise confortable, pour développer la tolérance des tissus et la capacité aérobie locale.|Long, lightly loaded hangs on a comfortable hold to build tissue tolerance and local aerobic capacity.",
"Tissus conjonctifs des doigts, capillarisation de l'avant-bras|Finger connective tissue, forearm capillarisation",
"Intensité volontairement basse : vous devez pouvoir tenir 40 s si nécessaire. Prise tendue de préférence.|Deliberately low intensity: you should be able to hold 40 s if needed. Open-hand grip preferred.",
"Chercher l'échec sur ces séries. Ce n'est pas leur objet.|Chasing failure on these sets. That is not what they are for.",
"5 à 8 séries de 30 s, 1 min de repos. Excellent en séance de récupération active.|5 to 8 sets of 30 s, 1 min rest. Excellent in an active recovery session.",
"Aucune contre-indication majeure hors douleur aiguë.|No major contraindication other than acute pain.");

X("fg-gripcompare","finger","inter",
"Protocole arqué / tendu comparé|Crimp vs open-hand comparative protocol",
"Mesure alternée de la charge maximale en demi-arqué puis en tendu, pour objectiver un déséquilibre de préhension.|Alternating maximal load measurement in half-crimp then open-hand, to quantify a grip imbalance.",
"Fléchisseurs profonds (tendu) contre superficiels et interosseux (arqué)|Deep flexors (open-hand) versus superficial flexors and interossei (crimp)",
"Même réglette, même durée, 3 min entre les deux mesures. Notez le ratio tendu/arqué : sous 0,85, le tendu est votre point faible.|Same edge, same duration, 3 min between measurements. Record the open/crimp ratio: below 0.85, open-hand is your weak point.",
"Comparer sur deux séances différentes ou deux réglettes différentes, ce qui invalide la comparaison.|Comparing across two different sessions or two different edges, which invalidates the comparison.",
"1 fois toutes les 6 à 8 semaines, en début de séance, doigts frais.|Once every 6 to 8 weeks, at the start of a session, on fresh fingers.",
"Mêmes contre-indications que les suspensions maximales.|Same contraindications as max hangs.");

X("fg-pockets","finger","adv",
"Bi-doigts contrôlés|Controlled two-finger pockets",
"Suspensions sur bi-doigts (majeur-annulaire puis index-majeur) à charge très réduite, pour préparer les pochettes en falaise.|Hangs on two-finger pockets (middle-ring then index-middle) at heavily reduced load, preparing for outdoor pockets.",
"Fléchisseurs isolés par doigt, poulies A2 des doigts longs|Per-finger flexors, A2 pulleys of the long fingers",
"Commencez avec les pieds au sol supportant la moitié du poids. Le mono-doigt n'est jamais un exercice de base.|Start with feet on the ground taking half your weight. One-finger hangs are never a foundational exercise.",
"Passer directement au bi-doigt suspendu à poids de corps complet.|Jumping straight to a full-bodyweight two-finger hang.",
"3 séries de 7 s par paire, très progressif sur 8 semaines minimum.|3 sets of 7 s per pair, very progressive over at least 8 weeks.",
"Tout antécédent de rupture de poulie, moins de 145 % du poids de corps en suspension quatre doigts.|Any history of pulley rupture, less than 145% body weight on a four-finger hang.");

X("fg-board","finger","inter",
"Cycles de pan Beastmaker|Beastmaker board cycles",
"Enchaînement structuré de préhensions variées sur poutre : arqué, tendu, bi-doigts, pinces, sur une séance de 20 minutes.|Structured sequence of varied grips on a fingerboard: crimp, open-hand, two-finger, pinch, over a 20-minute session.",
"Ensemble des préhensions, transfert vers la variété des prises réelles|Full range of grip positions, transferring to real hold variety",
"Alternez les préhensions plutôt que de répéter la même. C'est la variété qui construit la robustesse.|Alternate grips rather than repeating one. Variety is what builds robustness.",
"Faire le cycle complet à intensité maximale sur chaque préhension.|Running the full cycle at maximal intensity on every grip.",
"1 cycle de 20 min, 1 à 2 fois par semaine, en complément et non en remplacement du bloc.|One 20-min cycle, 1 to 2 times per week, complementing rather than replacing bouldering.",
"Douleur active sur une préhension : retirez-la du cycle, ne l'évitez pas par compensation.|Active pain on one grip: remove it from the cycle rather than compensating around it.");

X("fg-nohang","finger","all",
"Tirage sans suspension (no-hang)|No-hang lifts",
"Tirage vertical d'une charge à l'aide d'un bloc de préhension, pieds au sol. Charge parfaitement contrôlée, aucun risque de chute.|Vertical lift of a load using a grip block, feet on the ground. Perfectly controlled load, no fall risk.",
"Fléchisseurs des doigts, sans contrainte sur l'épaule|Finger flexors, with no shoulder demand",
"Bras le long du corps, coude à 30° environ. Idéal pour charger les doigts quand l'épaule ou le coude est en rééducation.|Arm at your side, elbow around 30°. Ideal for loading fingers while a shoulder or elbow is rehabbing.",
"Tirer avec le dos plutôt qu'avec les doigts : le bloc doit rester le maillon faible.|Pulling with the back rather than the fingers: the block must stay the weak link.",
"5 séries de 10 s, 2 min de repos. Charge ajustable au kilo près.|5 sets of 10 s, 2 min rest. Load adjustable to the kilo.",
"Aucune contre-indication majeure. C'est souvent la porte d'entrée la plus sûre.|No major contraindication. Often the safest entry point.");

X("fg-pinch","finger","all",
"Pinces lestées|Weighted pinch block",
"Tirage ou maintien d'un bloc de pince lesté, pouce en opposition, deux à quatre secondes de maintien.|Lift or hold of a weighted pinch block, thumb in opposition, two to four seconds of hold.",
"Adducteur du pouce, court fléchisseur du pouce, extenseurs du poignet|Adductor pollicis, flexor pollicis brevis, wrist extensors",
"Poignet neutre, pas de flexion. La pince est le déficit le plus fréquent chez les grimpeurs de bloc.|Neutral wrist, no flexion. Pinch strength is the most common deficit in boulderers.",
"Rouler le poignet en flexion pour tricher sur la prise.|Rolling the wrist into flexion to cheat the grip.",
"4 séries de 3 maintiens de 5 s par main, 90 s de repos.|4 sets of 3 holds of 5 s per hand, 90 s rest.",
"Douleur de la base du pouce (rhizarthrose, entorse du ligament collatéral).|Pain at the thumb base (thumb CMC arthritis, collateral ligament sprain).");

X("fg-jug","finger","all",
"Suspensions sur grosse prise|Jug hangs",
"Suspension passive puis active sur prise très confortable, pour évaluer et développer la tolérance à la traction.|Passive then active hang on a very comfortable hold, to assess and build traction tolerance.",
"Grand dorsal, coiffe des rotateurs, capsule gléno-humérale|Latissimus dorsi, rotator cuff, gleno-humeral capsule",
"Alternez 20 s passif décontracté et 10 s actif épaules engagées. C'est le premier test de tolérance de tout débutant.|Alternate 20 s relaxed passive and 10 s active with engaged shoulders. This is every beginner's first tolerance test.",
"Rester uniquement en passif si vous avez une instabilité d'épaule connue.|Staying purely passive if you have known shoulder instability.",
"3 à 5 séries, tous les jours si indolore. Excellent pour la santé de l'épaule.|3 to 5 sets, daily if pain-free. Excellent for shoulder health.",
"Instabilité gléno-humérale non rééduquée pour la version passive.|Non-rehabilitated gleno-humeral instability, for the passive version.");

/* ---------- Puissance ---------- */
X("pw-campus","power","adv",
"Campus 1-3-5|Campus ladders 1-3-5",
"Montée explosive sur réglettes de campus sans les pieds, en sautant des barreaux selon un schéma défini.|Explosive ladder on campus rungs without feet, skipping rungs to a set pattern.",
"Chaîne de traction complète, taux de développement de force, tissus des doigts|Full pulling chain, rate of force development, finger tissues",
"Toujours après échauffement complet et jamais sur les petites réglettes avant deux saisons de campus. Descendez, ne sautez jamais au sol.|Always after a full warm-up, and never on small rungs before two seasons of campusing. Climb down, never drop off.",
"Faire du campus pour la fatigue plutôt que pour la vitesse : dès que la vitesse baisse, la série est finie.|Campusing for fatigue rather than speed: as soon as speed drops, the set is over.",
"5 à 8 montées, 3 min de repos complet. Maximum 1 fois par semaine.|5 to 8 ladders, 3 min full rest. Maximum once per week.",
"Moins de 3 ans de pratique, tendinopathie de coude, antécédent de poulie de moins d'un an.|Less than 3 years of practice, elbow tendinopathy, pulley injury within the past year.");

X("pw-limit","power","inter",
"Bloc limite|Limit bouldering",
"Travail de 2 à 4 blocs à votre maximum absolu, sur des mouvements que vous ne réussissez pas encore.|Working 2 to 4 problems at your absolute maximum, on moves you cannot yet do.",
"Recrutement neuromusculaire maximal, coordination inter-segmentaire|Maximal neuromuscular recruitment, inter-segmental coordination",
"3 à 5 min de repos entre chaque essai. Un essai raté par fatigue n'apprend rien : arrêtez la série.|3 to 5 min rest between attempts. An attempt failed through fatigue teaches nothing: end the set.",
"Enchaîner les essais toutes les 30 secondes, ce qui transforme la séance en travail d'endurance.|Attempting every 30 seconds, which turns the session into endurance work.",
"45 à 60 min, 4 à 6 essais par bloc, 2 fois par semaine sur doigts frais.|45 to 60 min, 4 to 6 attempts per problem, twice a week on fresh fingers.",
"Fatigue accumulée, ACWR au-dessus de 1,4, douleur active.|Accumulated fatigue, ACWR above 1.4, active pain.");

X("pw-dyno","power","inter",
"Jetés contrôlés|Controlled dynos",
"Mouvements dynamiques vers une prise cible, avec réception contrôlée et maintien de 2 secondes.|Dynamic moves to a target hold, with controlled catch and a 2-second hold.",
"Chaîne postérieure, coordination pieds-bassin-mains, tension corporelle à la réception|Posterior chain, foot-hip-hand coordination, body tension on the catch",
"L'impulsion vient des jambes et du bassin, pas des bras. Regardez la prise cible jusqu'au contact.|Drive comes from legs and hips, not arms. Keep your eyes on the target hold until contact.",
"Tirer avec les bras dès le départ, ce qui plafonne l'amplitude et charge inutilement les coudes.|Pulling with the arms from the start, capping range and loading elbows needlessly.",
"8 à 12 mouvements de qualité, 2 min entre les essais.|8 to 12 quality moves, 2 min between attempts.",
"Douleur d'épaule, sol de réception inadapté.|Shoulder pain, inadequate landing surface.");

X("pw-explopull","power","inter",
"Traction explosive|Explosive pull-up",
"Traction menée le plus vite possible depuis bras tendus, en visant le point de contact le plus haut.|Pull-up performed as fast as possible from a dead hang, aiming for the highest contact point.",
"Grand dorsal, biceps, trapèzes inférieurs, taux de développement de force|Latissimus dorsi, biceps, lower trapezius, rate of force development",
"La qualité se mesure à la hauteur atteinte, pas au nombre. Descente contrôlée sur 2 s.|Quality is measured by height reached, not by count. Controlled 2 s lowering.",
"Continuer la série quand la hauteur baisse : l'effet puissance disparaît.|Continuing the set once height drops: the power effect is gone.",
"5 séries de 3 répétitions, 3 min de repos. Arrêt dès que la hauteur chute.|5 sets of 3 reps, 3 min rest. Stop as soon as height drops.",
"Tendinopathie de coude, épaule douloureuse en fin d'amplitude.|Elbow tendinopathy, shoulder painful at end range.");

X("pw-dropcatch","power","adv",
"Lâcher-rattrape sur pan|Drop-catch on the board",
"Depuis une position de blocage, lâchez une main et rattrapez la même prise en contrôlant l'excentrique.|From a locked position, release one hand and catch the same hold, controlling the eccentric.",
"Force excentrique des doigts et de l'épaule, raideur active de la chaîne|Eccentric finger and shoulder strength, active stiffness of the chain",
"Amplitude de chute très courte au départ, 5 cm maximum. C'est un exercice de contrôle, pas de choc.|Very short drop range at first, 5 cm maximum. This is a control exercise, not an impact one.",
"Chercher l'amplitude maximale dès la première séance.|Chasing maximum range from the first session.",
"3 séries de 3 par bras, 2 min de repos. Toutes les 2 semaines maximum.|3 sets of 3 per arm, 2 min rest. Every 2 weeks at most.",
"Tout antécédent de poulie ou d'épaule non consolidé.|Any unconsolidated pulley or shoulder history.");

X("pw-jumpsquat","power","all",
"Squat sauté avec réception|Jump squat with landing",
"Saut vertical depuis un demi-squat, avec réception amortie sur deux pieds et immobilisation d'une seconde.|Vertical jump from a half-squat, absorbed two-foot landing and a one-second freeze.",
"Quadriceps, fessiers, mollets, transfert vers les jetés de pied|Quadriceps, glutes, calves, transfer to foot-driven dynos",
"La réception compte autant que le saut : genoux alignés sur les pieds, silencieuse.|The landing matters as much as the jump: knees tracking over the feet, silent.",
"Réception raide jambes tendues, genoux qui rentrent vers l'intérieur.|Stiff straight-leg landing, knees collapsing inward.",
"4 séries de 5, 2 min de repos. Complément utile hors du mur.|4 sets of 5, 2 min rest. A useful off-the-wall complement.",
"Douleur de genou fémoro-patellaire, tendinopathie rotulienne.|Patellofemoral knee pain, patellar tendinopathy.");

X("pw-wpull","power","inter",
"Traction lestée lourde|Heavy weighted pull-up",
"Traction complète avec charge additionnelle, sur 3 à 5 répétitions maximum.|Full pull-up with added load, at 3 to 5 reps maximum.",
"Grand dorsal, grand rond, biceps, fixateurs de l'omoplate|Latissimus dorsi, teres major, biceps, scapular stabilisers",
"Amplitude complète : bras tendus en bas, menton franchement au-dessus de la barre. Serrez les fessiers pour éviter le cambré.|Full range: straight arms at the bottom, chin clearly above the bar. Squeeze the glutes to avoid arching.",
"Réduire l'amplitude en bas pour ajouter du poids.|Shortening the bottom range in order to add weight.",
"5 séries de 3 à 5 répétitions, 3 min de repos. 1 à 2 fois par semaine.|5 sets of 3 to 5 reps, 3 min rest. 1 to 2 times per week.",
"Tendinopathie du coude en phase douloureuse.|Elbow tendinopathy in a painful phase.");

X("pw-pogo","power","inter",
"Pogos et impulsion de bassin|Pogos and hip drive",
"Balancements rythmés du bassin sur un pan surplombant pour générer l'élan d'un mouvement sans tirer des bras.|Rhythmic hip swings on a steep board to generate momentum for a move without pulling with the arms.",
"Fléchisseurs de hanche, abdominaux profonds, coordination|Hip flexors, deep abdominals, coordination",
"Le pied libre lance, le bassin suit, la main part au dernier moment.|The free foot swings, the hips follow, the hand leaves last.",
"Utiliser les bras pour lancer, ce qui annule tout le bénéfice.|Using the arms to generate the swing, which defeats the purpose.",
"6 à 10 séquences par côté, en fin d'échauffement.|6 to 10 sequences per side, at the end of the warm-up.",
"Douleur lombaire en extension.|Lumbar pain in extension.");

/* ---------- Continuité ---------- */
X("en-4x4","endur","inter",
"4 × 4 blocs|4 × 4 boulder circuits",
"Quatre blocs enchaînés sans repos, répétés quatre fois, avec récupération entre les séries.|Four problems climbed back to back without rest, repeated four times, with recovery between sets.",
"Résistance anaérobie lactique, tolérance à l'acidose de l'avant-bras|Anaerobic lactic endurance, forearm acidosis tolerance",
"Choisissez des blocs que vous enchaînez à 80 %. Le quatrième tour doit être difficile mais réussi.|Pick problems you send at 80% effort. The fourth round should be hard but completed.",
"Choisir des blocs trop durs : vous faites du bloc limite fatigué, pas de la résistance.|Picking problems that are too hard: that is limit bouldering while tired, not endurance.",
"4 séries, 4 min de repos entre les séries. 1 fois par semaine en phase de résistance.|4 sets, 4 min rest between sets. Once a week in a resistance phase.",
"Phase de force maximale, ACWR supérieur à 1,3.|Maximal strength phase, ACWR above 1.3.");

X("en-arc","endur","all",
"Traversée ARC 20-40 min|ARC traversing, 20-40 min",
"Grimpe continue à très basse intensité, sans jamais atteindre la brûlure, pendant 20 à 40 minutes.|Continuous climbing at very low intensity, never reaching pump, for 20 to 40 minutes.",
"Capillarisation de l'avant-bras, capacité aérobie locale, technique en fatigue légère|Forearm capillarisation, local aerobic capacity, technique under light fatigue",
"Si vous devez secouer les bras, c'est trop dur. Profitez-en pour travailler les pieds silencieux.|If you need to shake out, it is too hard. Use the time to work on silent feet.",
"Monter en intensité par ennui, ce qui transforme la séance en résistance.|Drifting up in intensity out of boredom, turning the session into resistance work.",
"2 à 3 blocs de 20 min, 5 min de repos. 2 à 3 fois par semaine en base.|2 to 3 blocks of 20 min, 5 min rest. 2 to 3 times per week in a base phase.",
"Aucune contre-indication hors douleur active.|No contraindication other than active pain.");

X("en-laps","endur","inter",
"Longueurs enchaînées|Route laps",
"Deux à trois longueurs consécutives sur une voie deux niveaux sous votre maximum, sans repos au relais.|Two to three consecutive laps on a route two grades below your maximum, without resting at the anchor.",
"Résistance spécifique voie, gestion des repos en paroi|Route-specific endurance, in-route rest management",
"Descendez en moulinette et repartez immédiatement. Le deuxième tour est celui qui compte.|Lower off and start again immediately. The second lap is the one that matters.",
"S'arrêter au relais pour récupérer, ce qui casse la continuité.|Resting at the anchor, which breaks the continuity.",
"3 séries de 2 à 3 longueurs, 8 min de repos entre les séries.|3 sets of 2 to 3 laps, 8 min rest between sets.",
"Fatigue de doigts, douleur active.|Finger fatigue, active pain.");

X("en-intervals","endur","inter",
"Intervalles bloc 30/30|Boulder intervals 30/30",
"30 secondes de grimpe continue, 30 secondes de repos, répété 10 à 16 fois sur un pan.|30 seconds of continuous climbing, 30 seconds of rest, repeated 10 to 16 times on a board.",
"Puissance aérobie locale, resynthèse rapide de la phosphocréatine|Local aerobic power, rapid phosphocreatine resynthesis",
"Intensité stable du premier au dernier intervalle. Chronométrez, ne comptez pas les mouvements.|Steady intensity from first to last interval. Use a timer, do not count moves.",
"Partir trop fort et s'effondrer au huitième intervalle.|Going out too hard and falling apart by the eighth interval.",
"2 séries de 8 intervalles, 5 min entre les séries.|2 sets of 8 intervals, 5 min between sets.",
"Douleur de coude, phase de récupération.|Elbow pain, recovery phase.");

X("en-circuit","endur","inter",
"Circuits sur pan|Board circuits",
"Enchaînement d'un circuit de 25 à 40 mouvements sur pan à inclinaison modérée, deux à trois fois.|Linking a 25 to 40 move circuit on a moderately steep board, two to three times.",
"Résistance, mémoire motrice, économie de mouvement|Resistance, motor memory, movement economy",
"Mémorisez le circuit avant de partir. La performance vient de l'économie, pas de la force.|Memorise the circuit before starting. Performance comes from economy, not power.",
"Improviser le circuit à chaque tour, ce qui rend la charge impossible à comparer.|Improvising the circuit each lap, which makes the load impossible to compare.",
"3 à 4 tours, 6 min de repos. 1 à 2 fois par semaine.|3 to 4 laps, 6 min rest. 1 to 2 times per week.",
"ACWR élevé, doigts sensibles.|High ACWR, sensitive fingers.");

X("en-lowrep","endur","inter",
"Repeaters basse intensité|Low-intensity repeaters",
"Cycles 10 s d'effort / 5 s de repos sur grosse réglette, à 40-50 % de la charge maximale, sur 8 à 12 répétitions.|Cycles of 10 s work / 5 s rest on a large edge, at 40-50% of maximum load, for 8 to 12 reps.",
"Capacité aérobie des fléchisseurs, tolérance de charge répétée|Aerobic capacity of the finger flexors, repeated-load tolerance",
"Doit rester confortable jusqu'à la dernière répétition. Utile en phase de reprise.|Should stay comfortable through the last rep. Useful in a return-to-training phase.",
"Utiliser une réglette trop petite et transformer l'exercice en travail de force.|Using too small an edge and turning the exercise into strength work.",
"4 séries de 10 répétitions, 2 min de repos.|4 sets of 10 reps, 2 min rest.",
"Douleur de poulie non stabilisée.|Unstabilised pulley pain.");

X("en-pyramid","endur","all",
"Pyramide de longueurs|Lap pyramid",
"Enchaînement croissant puis décroissant de niveaux : 5c, 6a, 6b, 6a, 5c, avec repos fixe.|Ascending then descending grade ladder: 5c, 6a, 6b, 6a, 5c, with fixed rest.",
"Résistance progressive, gestion de l'effort sur une séance|Progressive endurance, effort management across a session",
"Le repos reste constant, seule la difficulté varie. Notez où la technique se dégrade.|Rest stays constant, only difficulty varies. Note where your technique degrades.",
"Allonger le repos quand ça devient dur, ce qui masque le point de rupture.|Extending rest when it gets hard, which hides your breaking point.",
"1 pyramide complète, 4 min entre chaque longueur.|One complete pyramid, 4 min between laps.",
"Aucune contre-indication majeure.|No major contraindication.");

X("en-6min","endur","inter",
"Continuité bloc 6 minutes|6-minute boulder continuity",
"Six minutes de grimpe continue sur pan, en gérant son intensité pour ne jamais tomber.|Six minutes of continuous board climbing, managing intensity to never fall.",
"Résistance mixte, lucidité tactique en fatigue|Mixed endurance, tactical clarity under fatigue",
"Repérez à l'avance vos prises de repos. Tomber avant la fin signifie une intensité mal calibrée.|Identify your rest holds in advance. Falling before the end means the intensity was miscalibrated.",
"Grimper sans plan et s'arrêter à la quatrième minute.|Climbing without a plan and stopping at the fourth minute.",
"3 séries de 6 min, 6 min de repos.|3 sets of 6 min, 6 min rest.",
"Doigts fatigués, retour de blessure récent.|Tired fingers, recent return from injury.");

/* ---------- Volume bloc ---------- */
X("bd-silent","boulder","all",
"Pieds silencieux|Silent feet",
"Grimpe sur une voie facile en posant chaque pied sans aucun bruit ni repositionnement.|Climbing an easy route placing every foot with no sound and no repositioning.",
"Contrôle proprioceptif du pied, précision du regard, économie|Foot proprioception, visual precision, economy",
"Regardez le pied jusqu'à ce qu'il soit posé, puis seulement ensuite regardez ailleurs.|Watch the foot until it lands, and only then look elsewhere.",
"Regarder la prochaine prise de main avant que le pied ne soit posé.|Looking at the next handhold before the foot has landed.",
"4 à 6 voies faciles, en échauffement, à chaque séance.|4 to 6 easy routes, during the warm-up, every session.",
"Aucune.|None.");

X("bd-onsight","boulder","all",
"Volume de blocs à vue|Onsight boulder volume",
"Enchaînement de 15 à 25 blocs faciles à modérés jamais essayés, au premier essai.|Climbing 15 to 25 easy to moderate never-tried problems, first go.",
"Lecture de bloc, répertoire moteur, adaptation|Problem reading, movement vocabulary, adaptability",
"Lisez le bloc depuis le sol pendant 30 s avant de partir. C'est la lecture qui progresse, pas la force.|Read the problem from the ground for 30 s before starting. What improves is the reading, not the strength.",
"Réessayer immédiatement après un échec : vous perdez le bénéfice du à-vue.|Retrying immediately after a failure: you lose the onsight benefit.",
"1 séance par semaine, 60 à 90 min.|One session per week, 60 to 90 min.",
"Aucune.|None.");

X("bd-downclimb","boulder","all",
"Désescalade|Down-climbing",
"Redescendre en grimpant chaque bloc réussi plutôt que de sauter.|Climbing back down every problem you send rather than jumping off.",
"Excentrique de la chaîne de traction, contrôle, volume articulaire doux|Eccentric pulling chain, control, gentle joint volume",
"Double le volume utile d'une séance sans augmenter l'intensité. Protège aussi les chevilles.|Doubles the useful volume of a session without raising intensity. It also protects your ankles.",
"Désescalader jusqu'à l'épuisement et compromettre la séance principale.|Down-climbing to exhaustion and compromising the main session.",
"Systématique sur tous les blocs d'échauffement et de volume.|Systematic on every warm-up and volume problem.",
"Blocs au-dessus de votre niveau de contrôle.|Problems above your level of control.");

X("bd-perfect","boulder","all",
"Répétitions parfaites|Perfect repeats",
"Répéter un bloc déjà réussi jusqu'à l'exécuter trois fois de suite sans hésitation ni ajustement.|Repeating a sent problem until you execute it three times in a row with no hesitation or adjustment.",
"Automatisation motrice, économie de mouvement|Motor automation, movement economy",
"L'objectif n'est pas de réussir mais de réussir identiquement. Filmez-vous pour comparer.|The goal is not to succeed but to succeed identically. Film yourself to compare.",
"Changer de méthode à chaque essai.|Changing beta on every attempt.",
"3 blocs par séance, 3 répétitions propres chacun.|3 problems per session, 3 clean repeats each.",
"Aucune.|None.");

X("bd-recall","boulder","inter",
"Mémorisation de séquence|Sequence recall",
"Lire un bloc, puis l'exécuter sans le regarder à nouveau depuis le sol.|Read a problem, then execute it without looking at it again from the ground.",
"Mémoire motrice, lecture, gestion du stress|Motor memory, reading, stress management",
"Verbalisez la séquence à voix haute avant de partir. Le rappel verbal ancre la lecture.|Say the sequence aloud before starting. Verbal recall anchors the reading.",
"Regarder les prises pendant la montée plutôt que d'anticiper.|Looking at holds during the climb rather than anticipating.",
"5 à 8 blocs par séance.|5 to 8 problems per session.",
"Aucune.|None.");

X("bd-steep","boulder","inter",
"Volume en dévers|Steep volume",
"Blocs modérés en dévers marqué, en privilégiant la tension corporelle sur la force de doigts.|Moderate problems on a steep wall, prioritising body tension over finger strength.",
"Chaîne antérieure, crochets de talon et de pointe, tension|Anterior chain, heel and toe hooks, tension",
"Cherchez le placement de bassin qui allège les mains avant de tirer plus fort.|Look for the hip placement that unweights the hands before pulling harder.",
"Compenser un mauvais placement par la force des bras.|Compensating poor positioning with arm strength.",
"1 séance par semaine, blocs 2 niveaux sous le maximum.|One session per week, problems 2 grades below maximum.",
"Douleur d'épaule en position haute.|Shoulder pain in overhead positions.");

X("bd-slab","boulder","all",
"Dalle et adhérence|Slab and friction",
"Blocs de dalle exigeant équilibre, confiance dans l'adhérence et lecture des pieds.|Slab problems demanding balance, trust in friction and foot reading.",
"Chevilles, chaîne latérale, confiance et gestion du risque|Ankles, lateral chain, confidence and risk management",
"Poussez sur la pointe, pas sur le talon. Le regard sur le pied jusqu'au transfert de poids complet.|Push through the toe, not the heel. Eyes on the foot until weight transfer is complete.",
"Se coller au mur : en dalle, l'éloignement crée la friction.|Hugging the wall: on slab, distance creates friction.",
"1 séance toutes les deux semaines minimum.|At least one session every two weeks.",
"Cheville instable, sol de réception inadapté.|Unstable ankle, inadequate landing.");

X("bd-roof","boulder","inter",
"Toits et crochets de talon|Roofs and heel hooks",
"Blocs de toit exigeant crochets de talon, de pointe et inversions.|Roof problems requiring heel hooks, toe hooks and inversions.",
"Ischio-jambiers, fessiers, abdominaux, coiffe des rotateurs|Hamstrings, glutes, abdominals, rotator cuff",
"Le crochet de talon se charge progressivement. Un talon chargé brutalement en rotation est la première cause de lésion des ischio-jambiers en escalade.|Load a heel hook progressively. A heel loaded abruptly in rotation is the leading cause of hamstring injury in climbing.",
"Tirer violemment sur un talon mal placé.|Yanking hard on a poorly placed heel.",
"1 séance par semaine, échauffement des ischio-jambiers obligatoire.|One session per week, hamstring warm-up mandatory.",
"Tendinopathie proximale des ischio-jambiers.|Proximal hamstring tendinopathy.");

X("bd-onefoot","boulder","all",
"Grimpe à un pied|One-foot climbing",
"Grimper une voie facile en n'utilisant qu'un seul pied, l'autre restant libre.|Climbing an easy route using only one foot, the other kept free.",
"Équilibre, rotation de hanche, engagement du tronc|Balance, hip rotation, trunk engagement",
"Force la rotation de bassin et le placement en lolotte sans y penser.|Forces hip rotation and drop-knee positioning without conscious effort.",
"Choisir une voie trop dure et compenser aux bras.|Picking too hard a route and compensating with the arms.",
"2 à 3 voies par côté en échauffement.|2 to 3 routes per side during the warm-up.",
"Aucune.|None.");

/* ---------- Souplesse ---------- */
X("mb-frog","mobility","all",
"Grenouille active|Active frog",
"Position quadrupédie genoux écartés, avec contractions isométriques de 10 s dans l'amplitude maximale.|Quadruped position with knees wide, holding 10 s isometric contractions at end range.",
"Adducteurs, capsule coxo-fémorale, rotateurs internes de hanche|Adductors, hip capsule, internal hip rotators",
"Poussez les genoux dans le sol pendant 10 s, relâchez, gagnez 1 cm, répétez. L'amplitude gagnée activement est celle que vous gardez.|Push the knees into the floor for 10 s, release, gain 1 cm, repeat. Range gained actively is range you keep.",
"Rester passif et rebondir dans la position.|Staying passive and bouncing in the position.",
"5 cycles de 10 s, 3 fois par semaine.|5 cycles of 10 s, 3 times per week.",
"Conflit fémoro-acétabulaire douloureux.|Painful femoroacetabular impingement.");

X("mb-lunge","mobility","all",
"Fente haute avec rotation|High lunge with rotation",
"Fente avant profonde avec rotation du tronc vers la jambe avant et bras tendu au plafond.|Deep forward lunge with trunk rotation toward the front leg and one arm reaching to the ceiling.",
"Psoas, quadriceps, rotateurs thoraciques|Psoas, quadriceps, thoracic rotators",
"Le bassin reste en rétroversion pour cibler le psoas plutôt que la lombaire.|Keep the pelvis posteriorly tilted to target the psoas rather than the lumbar spine.",
"Cambrer les lombaires pour paraître plus souple.|Arching the lumbar spine to look more flexible.",
"3 × 30 s par côté, en fin de séance.|3 × 30 s per side, at the end of a session.",
"Douleur lombaire en extension.|Lumbar pain in extension.");

X("mb-split","mobility","all",
"Écart facial progressif|Progressive middle split",
"Écartement latéral progressif avec contractions isométriques et gain d'amplitude par paliers.|Progressive lateral split with isometric contractions and range gained in increments.",
"Adducteurs, ischio-jambiers médiaux, capsule de hanche|Adductors, medial hamstrings, hip capsule",
"Pieds à plat ou pointes vers le haut selon votre morphologie. Progression sur des mois, pas des semaines.|Feet flat or toes up depending on your morphology. Progress over months, not weeks.",
"Forcer en passif jusqu'à la douleur.|Forcing passively into pain.",
"10 min, 3 fois par semaine, après échauffement.|10 min, 3 times per week, after warming up.",
"Lésion d'adducteur récente.|Recent adductor strain.");

X("mb-dislocate","mobility","all",
"Dislocations à la barre|Shoulder dislocates",
"Passage d'un bâton ou d'un élastique de l'avant vers l'arrière, bras tendus, prise progressivement resserrée.|Passing a stick or band from front to back, arms straight, grip progressively narrowed.",
"Capsule antérieure de l'épaule, grand pectoral, deltoïde antérieur|Anterior shoulder capsule, pectoralis major, anterior deltoid",
"Bras strictement tendus. Resserrez la prise seulement quand le passage est fluide et indolore.|Arms strictly straight. Narrow the grip only when the pass is smooth and pain-free.",
"Plier les coudes pour raccourcir le trajet.|Bending the elbows to shorten the path.",
"2 × 10 répétitions, tous les jours en échauffement.|2 × 10 reps, daily as part of the warm-up.",
"Instabilité antérieure d'épaule, luxation récente.|Anterior shoulder instability, recent dislocation.");

X("mb-erot","mobility","all",
"Rotation externe couchée|Lying external rotation",
"Allongé sur le dos, bras à 90° d'abduction, coude à 90°, laisser la main descendre vers le sol.|Lying on your back, arm at 90° abduction, elbow at 90°, letting the hand lower toward the floor.",
"Rotateurs internes, capsule postérieure, grand dorsal|Internal rotators, posterior capsule, latissimus dorsi",
"L'omoplate reste plaquée au sol. C'est l'amplitude mesurée par le test de mobilité ALTARIS.|The shoulder blade stays flat on the floor. This is the range measured by the ALTARIS mobility test.",
"Décoller l'omoplate pour gagner des degrés artificiels.|Lifting the shoulder blade to gain artificial degrees.",
"3 × 45 s par côté.|3 × 45 s per side.",
"Douleur antérieure d'épaule en fin d'amplitude.|Anterior shoulder pain at end range.");

X("mb-ankle","mobility","all",
"Dorsiflexion genou-mur|Knee-to-wall ankle",
"Genou avancé vers le mur, talon au sol, pour mesurer et gagner en dorsiflexion de cheville.|Knee driven toward the wall, heel down, to measure and gain ankle dorsiflexion.",
"Triceps sural, capsule talo-crurale|Calf complex, talocrural capsule",
"Le genou doit toucher le mur sans que le talon décolle. Sous 8 cm, la dalle et les gros pieds vous coûtent cher.|The knee must touch the wall without the heel lifting. Below 8 cm, slab and high steps cost you.",
"Laisser le pied partir en pronation pour gagner de la distance.|Letting the foot pronate to gain distance.",
"3 × 10 répétitions par côté, quotidien.|3 × 10 reps per side, daily.",
"Entorse de cheville en phase aiguë.|Acute ankle sprain.");

X("mb-thoracic","mobility","all",
"Extension thoracique|Thoracic extension",
"Extension du haut du dos sur un rouleau placé sous les omoplates, bras derrière la tête.|Upper back extension over a foam roller placed under the shoulder blades, arms behind the head.",
"Rachis thoracique, grand dorsal, chaîne antérieure|Thoracic spine, latissimus dorsi, anterior chain",
"Bloquez les côtes basses en soufflant pour éviter de compenser en lombaire.|Lock the lower ribs by exhaling to avoid compensating through the lumbar spine.",
"Cambrer les lombaires plutôt que d'ouvrir le thorax.|Arching the lumbar spine instead of opening the thorax.",
"2 min par segment, avant les séances de dévers.|2 min per segment, before steep sessions.",
"Ostéoporose, douleur costale.|Osteoporosis, rib pain.");

X("mb-hipload","mobility","inter",
"Abduction de hanche chargée|Loaded hip abduction",
"Abduction active de hanche contre élastique, dans l'amplitude utile de la lolotte.|Active hip abduction against a band, through the range used in a drop-knee.",
"Moyen fessier, rotateurs externes profonds|Gluteus medius, deep external rotators",
"Travaillez la force dans l'amplitude gagnée. La souplesse non contrôlée ne sert pas en escalade.|Build strength in the range you gained. Uncontrolled flexibility is of no use in climbing.",
"Étirer sans jamais renforcer l'amplitude nouvelle.|Stretching without ever strengthening the new range.",
"3 × 12 par côté, 2 fois par semaine.|3 × 12 per side, twice a week.",
"Conflit de hanche douloureux.|Painful hip impingement.");

/* ---------- Gainage ---------- */
X("cr-hollow","core","all",
"Hollow body hold|Hollow body hold",
"Maintien au sol, lombaires plaquées, bras et jambes tendus légèrement au-dessus du sol.|Floor hold with the lumbar spine flat, arms and legs straight and slightly off the floor.",
"Grand droit, transverse, obliques, fléchisseurs de hanche|Rectus abdominis, transversus, obliques, hip flexors",
"Si les lombaires décollent, remontez les jambes. C'est la position de référence de toute tension corporelle.|If the lumbar spine lifts, raise the legs. This is the reference position for all body tension.",
"Tenir plus longtemps en laissant le dos se creuser.|Holding longer by letting the back arch.",
"4 × 20 à 45 s, 3 fois par semaine.|4 × 20 to 45 s, 3 times per week.",
"Diastasis abdominal, hernie discale en poussée.|Abdominal diastasis, active disc herniation.");

X("cr-fl","core","inter",
"Progressions de front lever|Front lever progressions",
"Maintien horizontal suspendu, du groupé au complet, avec bassin en rétroversion et dos plat.|Horizontal hanging hold, from tuck to full, with a posteriorly tilted pelvis and flat back.",
"Grand dorsal, grand rond, abdominaux, fixateurs scapulaires|Latissimus dorsi, teres major, abdominals, scapular stabilisers",
"Passez à la variante suivante quand vous tenez 15 s propres. Épaules basses, bras tendus verrouillés.|Move to the next variant when you hold 15 clean seconds. Shoulders down, arms locked straight.",
"Plier les coudes pour tenir plus longtemps, ce qui change complètement l'exercice.|Bending the elbows to hold longer, which changes the exercise entirely.",
"5 × 8 à 15 s, 2 min de repos, 2 fois par semaine.|5 × 8 to 15 s, 2 min rest, twice a week.",
"Tendinopathie du long biceps, douleur lombaire.|Long head biceps tendinopathy, lumbar pain.");

X("cr-legraise","core","inter",
"Relevés de jambes suspendu|Hanging leg raises",
"Élévation contrôlée des jambes tendues jusqu'à la barre, sans balancement.|Controlled raise of straight legs to the bar, with no swing.",
"Grand droit, psoas, préhension|Rectus abdominis, psoas, grip",
"Enroulez le bassin en fin de mouvement : sans rétroversion, vous ne travaillez que les fléchisseurs de hanche.|Curl the pelvis at the top: without posterior tilt you are only working hip flexors.",
"Se balancer pour lancer les jambes.|Swinging to throw the legs up.",
"4 × 8 à 12 répétitions, tempo 2-1-2.|4 × 8 to 12 reps, 2-1-2 tempo.",
"Douleur lombaire, poulie sensible (la préhension charge les doigts).|Lumbar pain, sensitive pulley (the grip loads the fingers).");

X("cr-abwheel","core","inter",
"Roue abdominale|Ab wheel",
"Extension antérieure contrôlée avec retour, depuis les genoux puis debout.|Controlled anterior extension and return, from the knees then standing.",
"Chaîne antérieure complète, grand dorsal en excentrique|Full anterior chain, latissimus dorsi eccentrically",
"Le bassin reste en rétroversion pendant toute l'amplitude. Arrêtez-vous avant que le dos ne se creuse.|The pelvis stays posteriorly tilted throughout. Stop before the back arches.",
"Aller au maximum d'amplitude en cambrant.|Going to full range by arching.",
"3 × 8 à 12, 2 fois par semaine.|3 × 8 to 12, twice a week.",
"Lombalgie, hernie discale.|Low back pain, disc herniation.");

X("cr-tension","core","inter",
"Tension corporelle sur pan|Body tension on a steep board",
"Mouvements lents sur pan très déversant, avec les pieds imposés sur de petites prises.|Slow movements on a very steep board, with feet restricted to small holds.",
"Transfert direct de la tension vers la grimpe réelle|Direct transfer of tension to actual climbing",
"Le meilleur gainage pour un grimpeur reste la grimpe avec des pieds exigeants. Rien ne transfère mieux.|The best core work for a climber is still climbing with demanding footholds. Nothing transfers better.",
"Remplacer entièrement le travail au mur par des abdominaux au sol.|Replacing all wall work with floor ab work.",
"15 min par séance de dévers.|15 min per steep session.",
"Doigts fatigués.|Tired fingers.");

X("cr-pallof","core","all",
"Pallof press anti-rotation|Pallof press",
"Poussée horizontale d'un élastique latéral, en résistant à la rotation du tronc.|Horizontal press of a lateral band, resisting trunk rotation.",
"Obliques, transverse, stabilisateurs lombo-pelviens|Obliques, transversus, lumbopelvic stabilisers",
"Le bassin ne bouge pas d'un millimètre. La résistance à la rotation est ce qui vous garde collé au mur en dévers.|The pelvis does not move a millimetre. Anti-rotation strength is what keeps you against the wall on steep terrain.",
"Tourner les épaules avec l'élastique.|Turning the shoulders with the band.",
"3 × 12 par côté, tempo lent.|3 × 12 per side, slow tempo.",
"Aucune contre-indication majeure.|No major contraindication.");

X("cr-sideplank","core","all",
"Gainage latéral avec élévation|Side plank with hip lift",
"Gainage latéral sur l'avant-bras avec élévations et abaissements contrôlés du bassin.|Forearm side plank with controlled hip raises and lowers.",
"Obliques, carré des lombes, moyen fessier|Obliques, quadratus lumborum, gluteus medius",
"Alignez oreille, épaule, hanche et cheville. L'élévation vient de la hanche, pas de l'épaule.|Line up ear, shoulder, hip and ankle. The lift comes from the hip, not the shoulder.",
"Laisser le bassin tomber vers l'avant.|Letting the hips rotate forward.",
"3 × 12 par côté.|3 × 12 per side.",
"Douleur d'épaule en appui.|Shoulder pain under load.");

X("cr-dragon","core","adv",
"Dragon flag|Dragon flag",
"Descente excentrique du corps aligné depuis la verticale, épaules fixées sur un banc.|Eccentric lowering of the aligned body from vertical, shoulders anchored on a bench.",
"Chaîne antérieure complète, contrôle lombo-pelvien maximal|Full anterior chain, maximal lumbopelvic control",
"Descendez sur 5 s. Arrêtez le mouvement dès que le bassin casse l'alignement.|Lower over 5 s. Stop the movement as soon as the hips break the line.",
"Descendre en pliant à la hanche.|Lowering by hinging at the hip.",
"4 × 4 à 6 répétitions excentriques.|4 × 4 to 6 eccentric reps.",
"Lombalgie, gainage de base non acquis (hollow < 45 s).|Low back pain, base core not established (hollow < 45 s).");

X("cr-compress","core","inter",
"Compression assise|Seated compression",
"Assis jambes tendues, soulever les jambes du sol en gardant le dos droit.|Seated with straight legs, lifting the legs off the floor while keeping the back straight.",
"Fléchisseurs de hanche en course interne, grand droit|Hip flexors in inner range, rectus abdominis",
"C'est la qualité qui manque le plus souvent pour les crochets de talon hauts et les toits.|This is the quality most often missing for high heel hooks and roofs.",
"S'aider des mains en poussant fort sur le sol.|Helping with the hands by pushing hard on the floor.",
"4 × 10 s de maintien.|4 × 10 s holds.",
"Ischio-jambiers courts douloureux.|Painfully short hamstrings.");

/* ---------- Préhabilitation ---------- */
X("ph-erot","prehab","all",
"Rotation externe à l'élastique|Band external rotation",
"Rotation externe du bras contre élastique, coude au corps ou à 90° d'abduction.|External rotation against a band, elbow at the side or at 90° abduction.",
"Infra-épineux, petit rond, deltoïde postérieur|Infraspinatus, teres minor, posterior deltoid",
"Charge légère, tempo lent, volume élevé. Le déficit de rotateurs externes est quasi universel chez les grimpeurs.|Light load, slow tempo, high volume. An external rotator deficit is near-universal in climbers.",
"Utiliser un élastique trop fort et compenser par le tronc.|Using too strong a band and compensating with the trunk.",
"3 × 15 par côté, 3 fois par semaine, toute l'année.|3 × 15 per side, 3 times per week, year-round.",
"Aucune. C'est un exercice de fond.|None. This is foundational work.");

X("ph-ytw","prehab","all",
"Y-T-W au sol|Prone Y-T-W",
"Élévations des bras en Y, T puis W à plat ventre, sans charge ou avec 1 kg.|Arm raises in Y, T then W positions lying prone, unloaded or with 1 kg.",
"Trapèzes inférieurs et moyens, rhomboïdes|Lower and middle trapezius, rhomboids",
"Le mouvement part de l'omoplate, pas de la main. Décollez le thorax de rien du tout.|The movement starts at the shoulder blade, not the hand. Barely lift the chest at all.",
"Utiliser trop de charge et recruter les trapèzes supérieurs.|Using too much load and recruiting the upper traps.",
"3 × 10 de chaque lettre, 2 à 3 fois par semaine.|3 × 10 of each letter, 2 to 3 times per week.",
"Aucune.|None.");

X("ph-tyler","prehab","all",
"Excentrique de coude (Tyler twist)|Eccentric elbow work (Tyler twist)",
"Torsion excentrique d'une barre souple, protocole de référence de l'épicondylalgie latérale.|Eccentric twist of a flexible bar, the reference protocol for lateral epicondylalgia.",
"Extenseurs du poignet, court extenseur radial du carpe|Wrist extensors, extensor carpi radialis brevis",
"Une douleur de 3 à 4 sur 10 pendant l'exercice est acceptable et même attendue en rééducation.|Pain of 3 to 4 out of 10 during the exercise is acceptable and even expected in rehab.",
"Arrêter dès la moindre gêne : le tendon a besoin de charge pour se réorganiser.|Stopping at the slightest discomfort: the tendon needs load to remodel.",
"3 × 15 en excentrique lent (4 s), tous les jours pendant 6 à 12 semaines.|3 × 15 slow eccentrics (4 s), daily for 6 to 12 weeks.",
"Douleur supérieure à 5/10 pendant l'exercice, ou qui persiste 24 h après.|Pain above 5/10 during the exercise, or persisting 24 h afterwards.");

X("ph-fingerext","prehab","all",
"Extension des doigts à l'élastique|Band finger extensions",
"Ouverture des doigts contre un élastique annulaire ou dans un bac de sable.|Opening the fingers against a rubber band or in a tub of sand.",
"Extenseurs des doigts, interosseux dorsaux|Finger extensors, dorsal interossei",
"Compense le déséquilibre fléchisseurs/extenseurs créé par des années de grimpe.|Offsets the flexor/extensor imbalance built by years of climbing.",
"Aller trop vite : le mouvement doit être lent et complet.|Going too fast: the movement should be slow and complete.",
"3 × 25, tous les jours. Deux minutes bien investies.|3 × 25, daily. Two minutes well spent.",
"Aucune.|None.");

X("ph-scap","prehab","all",
"Tractions scapulaires|Scapular pull-ups",
"Depuis la suspension bras tendus, abaisser les omoplates sans plier les coudes.|From a straight-arm hang, depress the shoulder blades without bending the elbows.",
"Trapèze inférieur, dentelé antérieur, grand dorsal|Lower trapezius, serratus anterior, latissimus dorsi",
"Amplitude minuscule, 3 à 5 cm. C'est le premier maillon de toute traction saine.|Tiny range, 3 to 5 cm. It is the first link in any healthy pull.",
"Plier les coudes et transformer l'exercice en traction.|Bending the elbows and turning it into a pull-up.",
"3 × 10, en échauffement de chaque séance.|3 × 10, in the warm-up of every session.",
"Aucune.|None.");

X("ph-passive","prehab","all",
"Suspensions passives progressives|Progressive passive hangs",
"Suspension totalement relâchée sur grosse prise, durée augmentée progressivement.|Fully relaxed hang on a large hold, duration increased progressively.",
"Capsule gléno-humérale, coiffe en allongement, décompression|Gleno-humeral capsule, cuff in lengthened position, decompression",
"Protocole utilisé en rééducation de conflit sous-acromial. Commencez pieds au sol pour doser.|A protocol used in subacromial impingement rehab. Start with feet down to dose the load.",
"Passer en passif complet d'emblée avec une épaule instable.|Going fully passive straight away with an unstable shoulder.",
"3 × 30 s, tous les jours si indolore.|3 × 30 s, daily if pain-free.",
"Instabilité multidirectionnelle, hyperlaxité non contrôlée.|Multidirectional instability, uncontrolled hypermobility.");

X("ph-pronosup","prehab","all",
"Pronation-supination lestée|Weighted pronation-supination",
"Rotation lente de l'avant-bras avec un marteau ou une barre lestée d'un côté, coude fixé.|Slow forearm rotation with a hammer or one-sided loaded bar, elbow fixed.",
"Rond pronateur, supinateur, biceps distal|Pronator teres, supinator, distal biceps",
"Coude collé au corps. Amplitude complète dans les deux sens, tempo 3 s.|Elbow pinned to the body. Full range both ways, 3 s tempo.",
"Bouger l'épaule pour augmenter l'amplitude apparente.|Moving the shoulder to increase apparent range.",
"3 × 12 par sens, 2 fois par semaine.|3 × 12 each way, twice a week.",
"Douleur du biceps distal en phase aiguë.|Acute distal biceps pain.");

X("ph-wrist","prehab","all",
"Flexions-extensions de poignet|Wrist curls and reverse curls",
"Flexions et extensions de poignet avec haltère léger, avant-bras posé.|Wrist flexion and extension with a light dumbbell, forearm supported.",
"Fléchisseurs et extenseurs du carpe|Wrist flexors and extensors",
"Les extensions comptent davantage que les flexions : c'est le côté déficitaire chez le grimpeur.|Extensions matter more than flexions: that is the deficient side in climbers.",
"Charger lourd et raccourcir l'amplitude.|Loading heavy and shortening the range.",
"3 × 15 dans chaque sens, 2 fois par semaine.|3 × 15 each direction, twice a week.",
"Syndrome du canal carpien en poussée.|Active carpal tunnel syndrome.");

X("ph-serratus","prehab","all",
"Serratus push-up|Serratus push-up",
"En position de planche bras tendus, protraction et rétraction des omoplates sans plier les coudes.|In a straight-arm plank, protracting and retracting the shoulder blades without bending the elbows.",
"Dentelé antérieur, stabilité scapulo-thoracique|Serratus anterior, scapulothoracic stability",
"Poussez le sol loin de vous en fin de protraction. Le dentelé est le grand oublié de l'épaule du grimpeur.|Push the floor away at the end of protraction. Serratus is the forgotten muscle of the climber's shoulder.",
"Plier les coudes ou creuser les lombaires.|Bending the elbows or arching the lower back.",
"3 × 12, 3 fois par semaine.|3 × 12, 3 times per week.",
"Douleur de poignet en appui : passez sur les poings.|Wrist pain under load: switch to fists.");

X("ph-pulley","prehab","inter",
"Charge progressive de poulie|Progressive pulley loading",
"Protocole de remise en charge après lésion de poulie : suspension pieds au sol, charge augmentée de 10 % par semaine.|Return-to-load protocol after a pulley injury: hang with feet down, load increased by 10% per week.",
"Poulies A2 et A4, gaine des fléchisseurs|A2 and A4 pulleys, flexor tendon sheath",
"Toujours en tendu ou demi-arqué, jamais en arqué fermé. Douleur maximale tolérée : 3/10, sans réveil nocturne.|Always open-hand or half-crimp, never full crimp. Maximum tolerated pain: 3/10, with no night pain.",
"Reprendre l'arqué fermé avant 12 semaines.|Returning to full crimp before 12 weeks.",
"5 × 10 s, tous les 2 jours, sous supervision d'un professionnel de santé.|5 × 10 s, every 2 days, supervised by a healthcare professional.",
"Phase aiguë (moins de 3 semaines), œdème, craquement initial audible sans avis médical.|Acute phase (under 3 weeks), swelling, an initial audible pop without medical review.");

/* La bibliothèque affichée. En mode local c'est la banque intégrée ; en mode
   Supabase, setExercises() la remplace par ce que la RLS laisse voir.
   Le tableau est modifié en place : les modules qui l'importent suivent. */
const EXERCISES = _X.slice();             // mode local : toute la banque intégrée
function setExercises(list){ EXERCISES.length = 0; list.forEach(e => EXERCISES.push(e)); }

/** Ligne de la table exercises → forme "FR|EN" utilisée par les vues. */
function fromRow(r){
  const tt = r.title || {}, fr = (r.content || {}).fr || {}, en = (r.content || {}).en || {};
  const pair = (k) => (fr[k] || "") + "|" + (en[k] || fr[k] || "");
  return {
    id: r.slug || r.id, uuid: r.id, cat: r.category, lv: r.level || "all",
    n: (tt.fr || "") + "|" + (tt.en || tt.fr || ""),
    d: pair("description"), m: pair("muscles"), c: pair("cues"), e: pair("errors"),
    dose: pair("dose"), contra: pair("contraindications"),
    video: r.video_url || null, visibility: r.visibility,
    meta: (r.content || {}).meta || null,
    extra: { fr, en },                    // sous-catégorie, matériel… (base v2)
    variants: [fr.variants || [], en.variants || []]
  };
}

const exName = (e) => e.n.split("|")[LI()];
const exField = (e, f) => (e[f] || "|").split("|")[LI()];
/* Repli sur la banque intégrée : une séance déjà planifiée garde son libellé
   même si l'exercice n'est pas (ou plus) visible dans la bibliothèque. */
const exById  = (id) => EXERCISES.find(e => e.id === id)
  || (REPLACED[id] && EXERCISES.find(e => e.id === REPLACED[id]))
  || _X.find(e => e.id === id);
/* Vidéos de démonstration (table exercise_demos en mode Supabase), par id d'exercice. */
let DEMOS = {};
function setDemos(map){ DEMOS = {}; Object.entries(map || {}).forEach(([k, v]) => { if (v) DEMOS[k] = v; }); }
const demosNow = () => Object.assign({}, DEMOS);
/** Démonstration : fichier du bucket, lien, ou valeur locale (config) en mode démo. */
function exVideo(id){
  const e = exById(id);
  const key = e ? e.id : id;
  if (DEMOS[key]) return DEMOS[key];
  if (e && e.video) return e.video;
  const v = Store.get("config", "videos") || {}; return v[key] || null;
}
async function setExVideo(id, url){
  const v = Object.assign({}, Store.get("config", "videos") || {});
  if (url) v[id] = url; else delete v[id];
  delete v.id;
  await Store.put("config", "videos", v);
  audit("exercise_video", id);
}
const EX_LV_LB = { all:["Tous niveaux","All levels"], inter:["Intermédiaire +","Intermediate +"], adv:["Avancé / Expert","Advanced / Expert"] };
const EX_LV_COLOR = { all:"var(--good)", inter:"var(--warn)", adv:"var(--crit)" };

export { EXERCISES, EX_CATS, EX_LV_COLOR, EX_LV_LB, REPLACED, X, _X, exById, exField, exName, exVideo, fromRow, demosNow, setDemos, setExVideo, setExercises };
