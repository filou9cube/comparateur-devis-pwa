// --- Enregistrement du Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => { console.log('[App] SW enregistré:', registration.scope); })
            .catch((error) => { console.error('[App] Échec enregistrement SW:', error); });
    });
} else { console.log('[App] SW non supporté.'); }
// --- Fin Enregistrement SW ---


document.addEventListener('DOMContentLoaded', () => {
    console.log("[App] DEBUG: DOM Chargé - Début Script Principal");

    // --- Références aux éléments HTML ---
    const formDevis = document.getElementById('form-devis');
    const tableauBody = document.getElementById('liste-devis');
    const inputRecherche = document.getElementById('recherche-devis');
    const tableHead = document.querySelector('#tableau-devis thead');
    const filtreStatutSelect = document.getElementById('filtre-statut');
    const filtreFournisseurSelect = document.getElementById('filtre-fournisseur');
    const statutsPossibles = ['Demande en cours', 'Reçu', 'En comparaison', 'Accepté à récupérer', 'Accepté en commande', 'Refusé'];
    const overlay = document.getElementById('overlay-modification');
    const modal = document.getElementById('modal-modification');
    const formModifier = document.getElementById('form-modifier-devis');
    const boutonFermerModal = document.getElementById('fermer-modal');
    const boutonAnnulerModification = document.getElementById('annuler-modification');
    const boutonExporter = document.getElementById('bouton-exporter');
    const boutonImporter = document.getElementById('bouton-importer');
    const inputImportFichier = document.getElementById('import-fichier');

    // --- Variables globales pour l'état du tri ---
    let colonneTriActuelle = 'besoin';
    let directionTriActuelle = 'asc';

    const DEVIS_DB_KEY = 'devisDb';
    const PREFS_KEY = 'devisPrefs'; // Clé pour les préférences

    // --- Fonctions localStorage (Données) ---
    const getDevisLocalStorage = () => {
        const devisString = localStorage.getItem(DEVIS_DB_KEY);
        try { return (devisString === null || devisString === '[]') ? [] : JSON.parse(devisString); }
        catch (error) { console.error("ERREUR localStorage parse (devisDb):", error); return []; }
    };
    const saveDevisLocalStorage = (devisList) => {
        try {
            const listeValide = devisList.filter(item => item != null);
            localStorage.setItem(DEVIS_DB_KEY, JSON.stringify(listeValide));
        } catch (error) { console.error("ERREUR localStorage save (devisDb):", error); }
    };

    // --- Fonctions pour gérer les préférences (AVEC LOGS DETAILLES) ---
    const sauvegarderPreferences = () => {
        console.log("--- DEBUG: Appel de sauvegarderPreferences ---");
        try {
             const prefs = {
                 colonneTri: colonneTriActuelle, directionTri: directionTriActuelle,
                 recherche: inputRecherche.value, statut: filtreStatutSelect.value,
                 fournisseur: filtreFournisseurSelect.value
             };
             console.log("DEBUG: Valeurs actuelles à sauvegarder:", prefs);
             const prefsString = JSON.stringify(prefs);
             console.log("DEBUG: Préférences converties en JSON:", prefsString);
             localStorage.setItem(PREFS_KEY, prefsString);
             console.log("DEBUG: Préférences sauvegardées dans localStorage.");
         } catch (error) {
              console.error("ERREUR pendant sauvegarderPreferences:", error);
         }
         console.log("--- DEBUG: Fin de sauvegarderPreferences ---");
    };

    const chargerPreferences = () => {
        console.log("--- DEBUG: Appel de chargerPreferences ---");
        try {
            const prefsSauvegardees = localStorage.getItem(PREFS_KEY);
            console.log('DEBUG: Raw prefs lues depuis localStorage:', prefsSauvegardees);

            if (prefsSauvegardees) {
                const prefs = JSON.parse(prefsSauvegardees);
                console.log("DEBUG: Préférences parsées:", prefs);

                colonneTriActuelle = prefs.colonneTri || 'besoin';
                directionTriActuelle = prefs.directionTri || 'asc';
                console.log(`DEBUG: Tri appliqué aux variables: ${colonneTriActuelle} ${directionTriActuelle}`);

                inputRecherche.value = prefs.recherche || '';
                console.log("DEBUG: Recherche appliquée au champ:", inputRecherche.value);

                const statutPref = prefs.statut || '';
                if (filtreStatutSelect.querySelector(`option[value="${statutPref}"]`)) {
                     filtreStatutSelect.value = statutPref;
                } else { filtreStatutSelect.value = ''; }
                console.log("DEBUG: Filtre statut appliqué au select:", filtreStatutSelect.value);

                const fournisseurPref = prefs.fournisseur || '';
                if (filtreFournisseurSelect.querySelector(`option[value="${fournisseurPref}"]`)) {
                    filtreFournisseurSelect.value = fournisseurPref;
                } else { filtreFournisseurSelect.value = ''; }
                console.log("DEBUG: Filtre fournisseur appliqué au select:", filtreFournisseurSelect.value);

            } else {
                console.log("DEBUG: Aucune préférence sauvegardée trouvée dans localStorage.");
            }
        } catch (error) {
            console.error("ERREUR pendant chargerPreferences:", error);
            localStorage.removeItem(PREFS_KEY);
        }
        console.log("--- DEBUG: Fin de chargerPreferences ---");
    };


    // --- Fonctions d'affichage et de logique ---
    const mettreAJourStatut = (idDevis,nouveauStatut) => {const id=Number(idDevis);const l=getDevisLocalStorage();const i=l.findIndex(d=>d&&d.id===id);if(i!==-1){l[i].statut=nouveauStatut;saveDevisLocalStorage(l);filtrerEtAfficher();}};
    const ouvrirModalModification = (idDevis) => {const id=Number(idDevis);const l=getDevisLocalStorage();const d=l.find(dv=>dv&&dv.id===id);if(d){document.getElementById('modifier-id').value=d.id;document.getElementById('modifier-besoin').value=d.besoin??'';document.getElementById('modifier-fournisseur').value=d.fournisseur??'';document.getElementById('modifier-prix').value=d.prix??'';document.getElementById('modifier-date-reception').value=d.date_reception??'';document.getElementById('modifier-ref-devis').value=d.ref_devis??'';document.getElementById('modifier-notes').value=d.notes??'';overlay.classList.add('modal-visible');modal.classList.add('modal-visible');}else{console.error(`ERR: ID ${id} non trouvé.`);alert("Erreur chargement.");}};
    const fermerModalModification = () => {overlay.classList.remove('modal-visible');modal.classList.remove('modal-visible');};

    // --- Fonction de tri (AVEC LOGS DE DÉBOGAGE SPÉCIFIQUES pour le tri "Besoin") ---
    const trierListeDevis = (devisList) => {
        const listeTriee = [...devisList];
        listeTriee.sort((a, b) => {
            let valA = a?.[colonneTriActuelle] ?? '';
            let valB = b?.[colonneTriActuelle] ?? '';
            let comparaison = 0;

            if (colonneTriActuelle === 'prix') {
                valA = Number(valA) || 0;
                valB = Number(valB) || 0;
                comparaison = valA - valB;
            } else if (colonneTriActuelle === 'date_reception') {
                comparaison = String(valA).localeCompare(String(valB));
            } else {
                valA = String(valA).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                valB = String(valB).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                comparaison = valA.localeCompare(valB);
            }

            // const termeCritiquePourLog = 'vase d\'expansion'; // On peut commenter cette ligne
            // if (colonneTriActuelle === 'besoin' &&
            //     (String(a?.besoin ?? '').toLowerCase().includes(termeCritiquePourLog) ||
            //      String(b?.besoin ?? '').toLowerCase().includes(termeCritiquePourLog))) {
            //     console.log(`--- TRI DEBUG (pour '${termeCritiquePourLog}') ---`); // Et les logs spécifiques si le tri besoin est OK
            // }

            if (comparaison === 0 && colonneTriActuelle !== 'prix') {
                const prixASecondaire = Number(a?.prix || 0);
                const prixBSecondaire = Number(b?.prix || 0);
                comparaison = prixASecondaire - prixBSecondaire;
            }
            return directionTriActuelle === 'asc' ? comparaison : (comparaison * -1);
        });
        return listeTriee;
    };

    const mettreAJourIndicateursTri = () => {document.querySelectorAll('#tableau-devis thead th[data-column]').forEach(th=>{th.classList.remove('sort-asc','sort-desc');const aS=th.querySelector('.sort-arrow');if(aS)aS.textContent='';if(th.dataset.column===colonneTriActuelle){th.classList.add(directionTriActuelle==='asc'?'sort-asc':'sort-desc');let ar=directionTriActuelle==='asc'?' ▲':' ▼';if(aS)aS.textContent=ar;else{const s=document.createElement('span');s.className='sort-arrow';s.textContent=ar;th.appendChild(s);}}});};
    const populerFiltreStatut = () => {filtreStatutSelect.innerHTML='<option value="">Tous statuts</option>';statutsPossibles.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;filtreStatutSelect.appendChild(o);});};
    const populerFiltreFournisseur = () => {const l=getDevisLocalStorage();const f=[...new Set(l.map(d=>d.fournisseur).filter(Boolean))].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));const vActuelle=filtreFournisseurSelect.value;filtreFournisseurSelect.innerHTML='<option value="">Tous fourn.</option>';f.forEach(fn=>{const o=document.createElement('option');o.value=fn;o.textContent=fn;filtreFournisseurSelect.appendChild(o);});if(filtreFournisseurSelect.querySelector(`option[value="${vActuelle}"]`)){filtreFournisseurSelect.value=vActuelle;}else{filtreFournisseurSelect.value='';}console.log("[App] Filtre fournisseurs peuplé.");};

    const afficherDevis = (listeAAfficher) => {
        const devisList=listeAAfficher;tableauBody.innerHTML='';
        if(!Array.isArray(devisList)||devisList.length===0){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=8;td.textContent=inputRecherche?.value?'Aucun résultat.':'Aucun devis.';td.style.textAlign='center';tr.appendChild(td);tableauBody.appendChild(tr);return;}
        const meilleursPrix={};if(colonneTriActuelle==='besoin'&&directionTriActuelle==='asc'){const aD=getDevisLocalStorage();aD.forEach(d=>{if(!d.besoin||typeof d.prix!=='number')return;const k=d.besoin.toLowerCase();if(!meilleursPrix[k]||d.prix<meilleursPrix[k].prix){meilleursPrix[k]={prix:d.prix,ids:[d.id]};}else if(d.prix===meilleursPrix[k].prix){meilleursPrix[k].ids.push(d.id);}}); }
        devisList.forEach(devis=>{if(!devis||!devis.id)return;const tr=document.createElement('tr');tr.dataset.id=devis.id;if(devis.statut){let cS='statut-'+devis.statut.toLowerCase().replace(/\s+/g,'-').replace(/[éèêë]/g,'e').replace(/[àâä]/g,'a').replace(/[^a-z0-9-]/g,'');tr.classList.add(cS);} if(colonneTriActuelle==='besoin'&&directionTriActuelle==='asc'){const k=devis.besoin?devis.besoin.toLowerCase():'';if(meilleursPrix[k]&&meilleursPrix[k].ids.includes(devis.id)){tr.classList.add('meilleur-prix');}}
        ['besoin','fournisseur','prix','date_reception','ref_devis','notes','statut','actions'].forEach(cle=>{const td=document.createElement('td');if(cle==='prix'){const p=typeof devis.prix==='number'?devis.prix:0;td.textContent=p.toFixed(2)+' XPF';}else if(cle==='date_reception'){const d=devis.date_reception;if(d){try{const [a,m,j]=d.split('-');td.textContent=`${j}/${m}/${a}`;}catch(e){td.textContent=d;}}else{td.textContent='';}}else if(cle==='statut'){const sel=document.createElement('select');sel.dataset.id=devis.id;statutsPossibles.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;if(devis.statut===s)o.selected=true;sel.appendChild(o);});sel.addEventListener('change',(e)=>mettreAJourStatut(e.target.dataset.id,e.target.value));td.appendChild(sel);}else if(cle==='actions'){const bm=document.createElement('button');bm.textContent='Modif.';bm.classList.add('bouton-modifier');bm.dataset.id=devis.id;const bs=document.createElement('button');bs.textContent='Suppr.';bs.classList.add('bouton-supprimer');bs.dataset.id=devis.id;bs.addEventListener('click',(e)=>{if(confirm("Supprimer ?")){const id=Number(e.target.dataset.id);const l=getDevisLocalStorage();const nl=l.filter(i=>i&&i.id!==id);saveDevisLocalStorage(nl);populerFiltreFournisseur();filtrerEtAfficher();}});td.appendChild(bm);td.appendChild(bs);}else{td.textContent=devis[cle]??'';} tr.appendChild(td);});
        tableauBody.appendChild(tr);});
        // console.log("DEBUG: Fin de afficherDevis"); // Peut être décommenté
    };

    const filtrerEtAfficher = () => {
        console.log("--- DEBUG: Appel de filtrerEtAfficher ---");
        const termeRecherche = inputRecherche.value.toLowerCase();
        const statutFiltre = filtreStatutSelect.value;
        const fournisseurFiltre = filtreFournisseurSelect.value;
        console.log(`DEBUG: Valeurs lues pour filtrage: Recherche='${termeRecherche}', Statut='${statutFiltre}', Fournisseur='${fournisseurFiltre}'`);

        const tousLesDevis = getDevisLocalStorage();
        let devisApresFiltres = tousLesDevis;
        if(termeRecherche){devisApresFiltres=devisApresFiltres.filter(d=>(d.besoin?.toLowerCase().includes(termeRecherche)||d.fournisseur?.toLowerCase().includes(termeRecherche)));}
        if(statutFiltre){devisApresFiltres=devisApresFiltres.filter(d=>d.statut===statutFiltre);}
        if(fournisseurFiltre){devisApresFiltres=devisApresFiltres.filter(d=>d.fournisseur===fournisseurFiltre);}

        const devisTries = trierListeDevis(devisApresFiltres);
        console.log("DEBUG: Liste finale (filtrée et triée) pour affichage:", devisTries ? devisTries.length : 0, "éléments");
        afficherDevis(devisTries);
        mettreAJourIndicateursTri();
        sauvegarderPreferences(); // SAUVEGARDE LES PRÉFÉRENCES ICI
        console.log("--- DEBUG: Fin de filtrerEtAfficher (avec sauvegarde prefs) ---");
    };

    // --- Logique Export/Import ---
    boutonExporter.addEventListener('click',()=>{try{const d=localStorage.getItem(DEVIS_DB_KEY);if(!d||d==='[]'){alert("0 donnée.");return;} const b=new Blob([d],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;const dt=new Date().toISOString().slice(0,10);a.download=`sauvegarde_devis_${dt}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u);}catch(e){console.error("ERR export:",e);alert("Erreur export.");}});
    boutonImporter.addEventListener('click',()=>{inputImportFichier.click();});
    inputImportFichier.addEventListener('change',(e)=>{const f=e.target.files[0];if(!f){event.target.value=null;return;} if(!f.name.endsWith('.json')&&f.type!=='application/json'){alert("Format invalide.");event.target.value=null;return;} const r=new FileReader();r.onload=(ev)=>{if(confirm("ATTENTION! Remplacer données?")){try{const d=JSON.parse(ev.target.result);if(!Array.isArray(d)){throw new Error("Format JSON invalide.");} localStorage.setItem(DEVIS_DB_KEY,ev.target.result);localStorage.removeItem(PREFS_KEY); // Efface anciennes prefs après import
    colonneTriActuelle='besoin';directionTriActuelle='asc';inputRecherche.value='';filtreStatutSelect.value='';filtreFournisseurSelect.value='';populerFiltreFournisseur();populerFiltreStatut();chargerPreferences();filtrerEtAfficher();alert("Données importées!");}catch(err){console.error("ERR import:",err);alert("Erreur import: "+err.message);}} e.target.value=null;};r.onerror=()=>{console.error("ERR lecture");alert("Erreur lecture fichier.");event.target.value=null;};r.readAsText(f);});

    // --- Écouteurs d'événements Généraux ---
    inputRecherche.addEventListener('input', filtrerEtAfficher);
    filtreStatutSelect.addEventListener('change', filtrerEtAfficher);
    filtreFournisseurSelect.addEventListener('change', filtrerEtAfficher);
    formDevis.addEventListener('submit',(e)=>{e.preventDefault();const b=document.getElementById('besoin-demande').value.trim();const f=document.getElementById('nom-fournisseur').value.trim();const p=document.getElementById('prix-devis').value;const d=document.getElementById('date-reception').value;const r=document.getElementById('ref-devis').value.trim();const n=document.getElementById('notes-devis').value.trim();if(!b||!f||!p||!d){alert("Champs requis.");return;} const nD={id:Date.now(),besoin:b,fournisseur:f,prix:Number(p)||0,date_reception:d,ref_devis:r,notes:n,statut:'Demande en cours'};const l=getDevisLocalStorage();l.push(nD);saveDevisLocalStorage(l);formDevis.reset();populerFiltreFournisseur();filtrerEtAfficher();});
    tableauBody.addEventListener('click',(e)=>{if(e.target.classList.contains('bouton-modifier')){ouvrirModalModification(e.target.dataset.id);}});
    boutonFermerModal.addEventListener('click',fermerModalModification);
    boutonAnnulerModification.addEventListener('click',fermerModalModification);
    overlay.addEventListener('click',fermerModalModification);
    formModifier.addEventListener('submit',(e)=>{e.preventDefault();const id=Number(document.getElementById('modifier-id').value);const b=document.getElementById('modifier-besoin').value.trim();const f=document.getElementById('modifier-fournisseur').value.trim();const p=document.getElementById('modifier-prix').value;const d=document.getElementById('modifier-date-reception').value;const r=document.getElementById('modifier-ref-devis').value.trim();const n=document.getElementById('modifier-notes').value.trim();if(!b||!f||!p||!d){alert("Champs requis.");return;} const l=getDevisLocalStorage();const i=l.findIndex(dv=>dv&&dv.id===id);if(i!==-1){l[i].besoin=b;l[i].fournisseur=f;l[i].prix=Number(p)||0;l[i].date_reception=d;l[i].ref_devis=r;l[i].notes=n;saveDevisLocalStorage(l);fermerModalModification();populerFiltreFournisseur();filtrerEtAfficher();}else{console.error(`ERR: ID ${id} non trouvé.`);alert("Erreur sauvegarde.");}});
    tableHead.addEventListener('click',(e)=>{const th=e.target.closest('th[data-column]');if(!th)return;const nC=th.dataset.column;if(colonneTriActuelle===nC){directionTriActuelle=directionTriActuelle==='asc'?'desc':'asc';}else{colonneTriActuelle=nC;directionTriActuelle='asc';}filtrerEtAfficher();});

    // --- Appel initial ---
    console.log("[App] Appel initial.");
    populerFiltreStatut();
    populerFiltreFournisseur();
    chargerPreferences();   // CHARGE LES PRÉFÉRENCES ICI
    filtrerEtAfficher();    // Affiche ET SAUVEGARDE l'état initial/chargé

    console.log("[App] DEBUG: Script End Reached");

}); // Fin DOMContentLoaded