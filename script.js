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
    // MODIFICATION : Ajout du nouveau statut "Accepté récupéré"
    const statutsPossibles = ['Demande en cours', 'Reçu', 'En comparaison', 'Accepté à récupérer', 'Accepté récupéré', 'Accepté en commande', 'Refusé'];
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
            const listeValide = devisList.filter(item => item != null); // S'assurer de ne pas sauvegarder des nulls
            localStorage.setItem(DEVIS_DB_KEY, JSON.stringify(listeValide));
        } catch (error) { console.error("ERREUR localStorage save (devisDb):", error); }
    };

    // --- Fonctions pour gérer les préférences ---
    const sauvegarderPreferences = () => {
        try {
             const prefs = {
                 colonneTri: colonneTriActuelle,
                 directionTri: directionTriActuelle,
                 recherche: inputRecherche.value,
                 statut: filtreStatutSelect.value,
                 fournisseur: filtreFournisseurSelect.value
             };
             localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
         } catch (error) {
              console.error("ERREUR pendant sauvegarderPreferences:", error);
         }
    };

    const chargerPreferences = () => {
        try {
            const prefsSauvegardees = localStorage.getItem(PREFS_KEY);
            if (prefsSauvegardees) {
                const prefs = JSON.parse(prefsSauvegardees);

                colonneTriActuelle = prefs.colonneTri || 'besoin';
                directionTriActuelle = prefs.directionTri || 'asc';
                inputRecherche.value = prefs.recherche || '';

                // Pour les selects, s'assurer que l'option existe avant de la définir
                const statutPref = prefs.statut || '';
                if (filtreStatutSelect.querySelector(`option[value="${statutPref}"]`)) {
                     filtreStatutSelect.value = statutPref;
                } else {
                    filtreStatutSelect.value = ''; // Valeur par défaut si l'ancienne n'est plus valide
                }

                const fournisseurPref = prefs.fournisseur || '';
                if (filtreFournisseurSelect.querySelector(`option[value="${fournisseurPref}"]`)) {
                    filtreFournisseurSelect.value = fournisseurPref;
                } else {
                    filtreFournisseurSelect.value = ''; // Valeur par défaut
                }
            }
        } catch (error) {
            console.error("ERREUR pendant chargerPreferences:", error);
            // En cas d'erreur de parsing, il est bon de supprimer les préférences corrompues
            localStorage.removeItem(PREFS_KEY);
        }
    };

    // --- Fonctions d'affichage et de logique ---
    const mettreAJourStatut = (idDevis, nouveauStatut) => {
        const id = Number(idDevis);
        const devisList = getDevisLocalStorage();
        const devisIndex = devisList.findIndex(d => d && d.id === id);
        if (devisIndex !== -1) {
            devisList[devisIndex].statut = nouveauStatut;
            saveDevisLocalStorage(devisList);
            filtrerEtAfficher(); // Rafraîchir l'affichage
        }
    };

    const ouvrirModalModification = (idDevis) => {
        const id = Number(idDevis);
        const devisList = getDevisLocalStorage();
        const devisAModifier = devisList.find(dv => dv && dv.id === id);
        if (devisAModifier) {
            document.getElementById('modifier-id').value = devisAModifier.id;
            document.getElementById('modifier-besoin').value = devisAModifier.besoin ?? '';
            document.getElementById('modifier-fournisseur').value = devisAModifier.fournisseur ?? '';
            document.getElementById('modifier-prix').value = devisAModifier.prix ?? '';
            document.getElementById('modifier-date-reception').value = devisAModifier.date_reception ?? '';
            document.getElementById('modifier-ref-devis').value = devisAModifier.ref_devis ?? '';
            document.getElementById('modifier-notes').value = devisAModifier.notes ?? '';
            overlay.classList.add('modal-visible');
            modal.classList.add('modal-visible');
        } else {
            console.error(`ERREUR: Devis avec ID ${id} non trouvé pour modification.`);
            alert("Erreur lors du chargement du devis pour modification.");
        }
    };

    const fermerModalModification = () => {
        overlay.classList.remove('modal-visible');
        modal.classList.remove('modal-visible');
    };

    // --- Fonction de tri ---
    const trierListeDevis = (devisList) => {
        const listeTriee = [...devisList]; // Créer une copie pour ne pas modifier l'original
        listeTriee.sort((a, b) => {
            // Gérer les cas où a ou b, ou leurs propriétés de tri, pourraient être null/undefined
            let valA = a?.[colonneTriActuelle] ?? '';
            let valB = b?.[colonneTriActuelle] ?? '';
            let comparaison = 0;

            if (colonneTriActuelle === 'prix') {
                valA = Number(valA) || 0; // Convertir en nombre, 0 si NaN
                valB = Number(valB) || 0;
                comparaison = valA - valB;
            } else if (colonneTriActuelle === 'date_reception') {
                // Comparaison de dates (suppose le format AAAA-MM-JJ)
                comparaison = String(valA).localeCompare(String(valB));
            } else {
                // Comparaison de chaînes (insensible à la casse et aux accents)
                valA = String(valA).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                valB = String(valB).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                comparaison = valA.localeCompare(valB);
            }

            // Critère de tri secondaire (prix) si les valeurs primaires sont égales (sauf si on trie déjà par prix)
            if (comparaison === 0 && colonneTriActuelle !== 'prix') {
                const prixASecondaire = Number(a?.prix || 0);
                const prixBSecondaire = Number(b?.prix || 0);
                comparaison = prixASecondaire - prixBSecondaire;
            }

            return directionTriActuelle === 'asc' ? comparaison : (comparaison * -1);
        });
        return listeTriee;
    };

    const mettreAJourIndicateursTri = () => {
        document.querySelectorAll('#tableau-devis thead th[data-column]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const arrowSpan = th.querySelector('.sort-arrow');
            if (arrowSpan) arrowSpan.textContent = ''; // Effacer ancienne flèche

            if (th.dataset.column === colonneTriActuelle) {
                th.classList.add(directionTriActuelle === 'asc' ? 'sort-asc' : 'sort-desc');
                let arrow = directionTriActuelle === 'asc' ? ' ▲' : ' ▼';
                if (arrowSpan) {
                    arrowSpan.textContent = arrow;
                } else {
                    const newArrowSpan = document.createElement('span');
                    newArrowSpan.className = 'sort-arrow';
                    newArrowSpan.textContent = arrow;
                    th.appendChild(newArrowSpan);
                }
            }
        });
    };

    const populerFiltreStatut = () => {
        const valeurActuelle = filtreStatutSelect.value; // Sauvegarder la sélection actuelle
        filtreStatutSelect.innerHTML = '<option value="">Tous les statuts</option>'; // Option par défaut
        statutsPossibles.forEach(statut => {
            const option = document.createElement('option');
            option.value = statut;
            option.textContent = statut;
            filtreStatutSelect.appendChild(option);
        });
        // Restaurer la sélection si elle est toujours valide
        if (statutsPossibles.includes(valeurActuelle)) {
            filtreStatutSelect.value = valeurActuelle;
        } else {
            filtreStatutSelect.value = ""; // Sinon, réinitialiser au défaut
        }
    };

    const populerFiltreFournisseur = () => {
        const devisList = getDevisLocalStorage();
        const fournisseurs = [...new Set(devisList.map(d => d.fournisseur).filter(Boolean))].sort((a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase()));
        const valeurActuelle = filtreFournisseurSelect.value;
        filtreFournisseurSelect.innerHTML = '<option value="">Tous les fournisseurs</option>';
        fournisseurs.forEach(fournisseur => {
            const option = document.createElement('option');
            option.value = fournisseur;
            option.textContent = fournisseur;
            filtreFournisseurSelect.appendChild(option);
        });
        if (fournisseurs.includes(valeurActuelle)) {
            filtreFournisseurSelect.value = valeurActuelle;
        } else {
            filtreFournisseurSelect.value = "";
        }
        console.log("[App] Filtre fournisseurs peuplé.");
    };

    const afficherDevis = (listeAAfficher) => {
        tableauBody.innerHTML = ''; // Vider le tableau
        if (!Array.isArray(listeAAfficher) || listeAAfficher.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 8; // S'assurer que cela correspond au nombre de colonnes
            td.textContent = inputRecherche.value || filtreStatutSelect.value || filtreFournisseurSelect.value ? 'Aucun résultat pour votre recherche/filtre.' : 'Aucun devis enregistré pour le moment.';
            td.style.textAlign = 'center';
            tr.appendChild(td);
            tableauBody.appendChild(tr);
            return;
        }

        // Calcul des meilleurs prix par besoin (uniquement si trié par besoin ascendant)
        const meilleursPrixParBesoin = {};
        if (colonneTriActuelle === 'besoin' && directionTriActuelle === 'asc') {
            const tousLesDevis = getDevisLocalStorage(); // Utiliser tous les devis pour une comparaison globale
            tousLesDevis.forEach(devis => {
                if (!devis || !devis.besoin || typeof devis.prix !== 'number') return;
                const besoinKey = devis.besoin.toLowerCase().trim();
                if (!meilleursPrixParBesoin[besoinKey] || devis.prix < meilleursPrixParBesoin[besoinKey].prix) {
                    meilleursPrixParBesoin[besoinKey] = { prix: devis.prix, ids: [devis.id] };
                } else if (devis.prix === meilleursPrixParBesoin[besoinKey].prix) {
                    meilleursPrixParBesoin[besoinKey].ids.push(devis.id);
                }
            });
        }

        listeAAfficher.forEach(devis => {
            if (!devis || typeof devis.id === 'undefined') return; // S'assurer que le devis et son ID existent

            const tr = document.createElement('tr');
            tr.dataset.id = devis.id;

            // Appliquer la classe de statut pour la couleur de fond
            if (devis.statut) {
                // Générer un nom de classe CSS valide à partir du statut
                let classeStatut = 'statut-' + devis.statut.toLowerCase()
                    .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
                    .replace(/[éèêë]/g, 'e') // Normaliser les accents
                    .replace(/[àâä]/g, 'a')
                    .replace(/[^a-z0-9-]/g, ''); // Supprimer les caractères non alphanumériques ou non-tiret
                tr.classList.add(classeStatut);
            }

            // Appliquer la classe meilleur-prix si applicable
            if (colonneTriActuelle === 'besoin' && directionTriActuelle === 'asc') {
                const besoinKey = devis.besoin ? devis.besoin.toLowerCase().trim() : '';
                if (meilleursPrixParBesoin[besoinKey] && meilleursPrixParBesoin[besoinKey].ids.includes(devis.id)) {
                    tr.classList.add('meilleur-prix');
                }
            }

            // Créer les cellules du tableau
            ['besoin', 'fournisseur', 'prix', 'date_reception', 'ref_devis', 'notes', 'statut', 'actions'].forEach(colonne => {
                const td = document.createElement('td');
                if (colonne === 'prix') {
                    const prix = typeof devis.prix === 'number' ? devis.prix : 0;
                    td.textContent = prix.toFixed(2) + ' XPF';
                } else if (colonne === 'date_reception') {
                    const dateStr = devis.date_reception;
                    if (dateStr) { // Format AAAA-MM-JJ
                        try {
                            const [annee, mois, jour] = dateStr.split('-');
                            td.textContent = `${jour}/${mois}/${annee}`; // Afficher JJ/MM/AAAA
                        } catch (e) {
                            td.textContent = dateStr; // Afficher la date brute en cas d'erreur
                        }
                    } else {
                        td.textContent = '';
                    }
                } else if (colonne === 'statut') {
                    const selectStatut = document.createElement('select');
                    selectStatut.dataset.id = devis.id; // Lier le select à l'ID du devis
                    statutsPossibles.forEach(s => {
                        const option = document.createElement('option');
                        option.value = s;
                        option.textContent = s;
                        if (devis.statut === s) option.selected = true;
                        selectStatut.appendChild(option);
                    });
                    selectStatut.addEventListener('change', (e) => mettreAJourStatut(e.target.dataset.id, e.target.value));
                    td.appendChild(selectStatut);
                } else if (colonne === 'actions') {
                    const boutonModifier = document.createElement('button');
                    boutonModifier.textContent = 'Modif.';
                    boutonModifier.classList.add('bouton-modifier');
                    boutonModifier.dataset.id = devis.id;
                    // L'événement pour modifier est géré par délégation sur tableauBody

                    const boutonSupprimer = document.createElement('button');
                    boutonSupprimer.textContent = 'Suppr.';
                    boutonSupprimer.classList.add('bouton-supprimer');
                    boutonSupprimer.dataset.id = devis.id;
                    boutonSupprimer.addEventListener('click', (e) => {
                        if (confirm("Êtes-vous sûr de vouloir supprimer ce devis ?")) {
                            const idASupprimer = Number(e.target.dataset.id);
                            let devisList = getDevisLocalStorage();
                            devisList = devisList.filter(item => item && item.id !== idASupprimer);
                            saveDevisLocalStorage(devisList);
                            populerFiltreFournisseur(); // Mettre à jour le filtre au cas où un fournisseur disparaîtrait
                            filtrerEtAfficher(); // Rafraîchir
                        }
                    });
                    td.appendChild(boutonModifier);
                    td.appendChild(boutonSupprimer);
                } else {
                    td.textContent = devis[colonne] ?? ''; // Utiliser l'opérateur de coalescence nulle
                }
                tr.appendChild(td);
            });
            tableauBody.appendChild(tr);
        });
    };

    const filtrerEtAfficher = () => {
        const termeRecherche = inputRecherche.value.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const statutFiltre = filtreStatutSelect.value;
        const fournisseurFiltre = filtreFournisseurSelect.value;

        let devisFiltres = getDevisLocalStorage();

        if (termeRecherche) {
            devisFiltres = devisFiltres.filter(d =>
                (d.besoin?.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(termeRecherche)) ||
                (d.fournisseur?.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(termeRecherche))
            );
        }
        if (statutFiltre) {
            devisFiltres = devisFiltres.filter(d => d.statut === statutFiltre);
        }
        if (fournisseurFiltre) {
            devisFiltres = devisFiltres.filter(d => d.fournisseur === fournisseurFiltre);
        }

        const devisTries = trierListeDevis(devisFiltres);
        afficherDevis(devisTries);
        mettreAJourIndicateursTri();
        sauvegarderPreferences(); // Sauvegarder les préférences après chaque affichage/filtrage
    };

    // --- Logique Export/Import ---
    boutonExporter.addEventListener('click', () => {
        try {
            const devisData = localStorage.getItem(DEVIS_DB_KEY);
            if (!devisData || devisData === '[]') {
                alert("Aucune donnée à exporter.");
                return;
            }
            const blob = new Blob([devisData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const dateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // Format AAAA MM JJ
            a.download = `sauvegarde_devis_${dateSuffix}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Erreur lors de l'exportation:", e);
            alert("Une erreur est survenue lors de l'exportation des données.");
        }
    });

    boutonImporter.addEventListener('click', () => {
        inputImportFichier.click(); // Déclenche le clic sur l'input file caché
    });

    inputImportFichier.addEventListener('change', (event) => {
        const fichier = event.target.files[0];
        if (!fichier) {
            event.target.value = null; // Réinitialiser pour permettre la re-sélection du même fichier
            return;
        }
        if (!fichier.name.endsWith('.json') && fichier.type !== 'application/json') {
            alert("Format de fichier invalide. Veuillez sélectionner un fichier .json.");
            event.target.value = null;
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            if (confirm("ATTENTION ! L'importation remplacera toutes les données actuelles. Voulez-vous continuer ?")) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!Array.isArray(data)) { // Validation basique du format
                        throw new Error("Le contenu du fichier JSON n'est pas un tableau valide de devis.");
                    }
                    // Idéalement, valider chaque objet devis ici
                    localStorage.setItem(DEVIS_DB_KEY, e.target.result);
                    localStorage.removeItem(PREFS_KEY); // Effacer les anciennes préférences après import
                    // Réinitialiser les filtres et le tri aux valeurs par défaut
                    colonneTriActuelle = 'besoin';
                    directionTriActuelle = 'asc';
                    inputRecherche.value = '';
                    filtreStatutSelect.value = '';
                    filtreFournisseurSelect.value = '';

                    populerFiltreFournisseur(); // Mettre à jour les filtres avec les nouvelles données
                    populerFiltreStatut();
                    chargerPreferences(); // Charger les préférences (qui seront maintenant vides ou par défaut)
                    filtrerEtAfficher(); // Afficher les données importées
                    alert("Données importées avec succès !");
                } catch (err) {
                    console.error("Erreur lors de l'importation:", err);
                    alert("Erreur lors de l'importation des données : " + err.message);
                }
            }
            event.target.value = null; // Réinitialiser l'input file
        };
        reader.onerror = () => {
            console.error("Erreur de lecture du fichier.");
            alert("Erreur lors de la lecture du fichier.");
            event.target.value = null;
        };
        reader.readAsText(fichier);
    });

    // --- Écouteurs d'événements Généraux ---
    inputRecherche.addEventListener('input', filtrerEtAfficher);
    filtreStatutSelect.addEventListener('change', filtrerEtAfficher);
    filtreFournisseurSelect.addEventListener('change', filtrerEtAfficher);

    formDevis.addEventListener('submit', (e) => {
        e.preventDefault();
        const besoin = document.getElementById('besoin-demande').value.trim();
        const fournisseur = document.getElementById('nom-fournisseur').value.trim();
        const prix = document.getElementById('prix-devis').value;
        const dateReception = document.getElementById('date-reception').value;
        const refDevis = document.getElementById('ref-devis').value.trim();
        const notes = document.getElementById('notes-devis').value.trim();

        if (!besoin || !fournisseur || !prix || !dateReception) {
            alert("Les champs Besoin/Demande, Nom du Fournisseur, Prix et Date de Réception sont requis.");
            return;
        }

        const nouveauDevis = {
            id: Date.now(), // ID unique simple
            besoin: besoin,
            fournisseur: fournisseur,
            prix: Number(prix) || 0,
            date_reception: dateReception,
            ref_devis: refDevis,
            notes: notes,
            statut: 'Demande en cours' // Statut par défaut
        };

        const devisList = getDevisLocalStorage();
        devisList.push(nouveauDevis);
        saveDevisLocalStorage(devisList);
        formDevis.reset(); // Vider le formulaire
        document.getElementById('besoin-demande').focus(); // Focus sur le premier champ
        populerFiltreFournisseur(); // Mettre à jour le filtre des fournisseurs
        filtrerEtAfficher(); // Rafraîchir l'affichage
    });

    // Utiliser la délégation d'événements pour les boutons "Modifier" car ils sont créés dynamiquement
    tableauBody.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('bouton-modifier')) {
            ouvrirModalModification(e.target.dataset.id);
        }
    });

    boutonFermerModal.addEventListener('click', fermerModalModification);
    boutonAnnulerModification.addEventListener('click', fermerModalModification);
    overlay.addEventListener('click', fermerModalModification); // Fermer en cliquant hors de la modale

    formModifier.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = Number(document.getElementById('modifier-id').value);
        const besoin = document.getElementById('modifier-besoin').value.trim();
        const fournisseur = document.getElementById('modifier-fournisseur').value.trim();
        const prix = document.getElementById('modifier-prix').value;
        const dateReception = document.getElementById('modifier-date-reception').value;
        const refDevis = document.getElementById('modifier-ref-devis').value.trim();
        const notes = document.getElementById('modifier-notes').value.trim();

        if (!besoin || !fournisseur || !prix || !dateReception) {
            alert("Les champs Besoin/Demande, Nom du Fournisseur, Prix et Date de Réception sont requis.");
            return;
        }

        const devisList = getDevisLocalStorage();
        const devisIndex = devisList.findIndex(dv => dv && dv.id === id);

        if (devisIndex !== -1) {
            devisList[devisIndex].besoin = besoin;
            devisList[devisIndex].fournisseur = fournisseur;
            devisList[devisIndex].prix = Number(prix) || 0;
            devisList[devisIndex].date_reception = dateReception;
            devisList[devisIndex].ref_devis = refDevis;
            devisList[devisIndex].notes = notes;
            // Le statut n'est pas modifié ici, il l'est via la liste déroulante du tableau
            saveDevisLocalStorage(devisList);
            fermerModalModification();
            populerFiltreFournisseur(); // Mettre à jour si le nom du fournisseur a changé
            filtrerEtAfficher();
        } else {
            console.error(`ERREUR: Devis avec ID ${id} non trouvé lors de la sauvegarde des modifications.`);
            alert("Erreur lors de la sauvegarde des modifications.");
        }
    });

    tableHead.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-column]'); // S'assurer de cliquer sur un TH avec data-column
        if (!th) return;

        const nouvelleColonneTri = th.dataset.column;
        if (colonneTriActuelle === nouvelleColonneTri) {
            directionTriActuelle = directionTriActuelle === 'asc' ? 'desc' : 'asc';
        } else {
            colonneTriActuelle = nouvelleColonneTri;
            directionTriActuelle = 'asc'; // Par défaut en ascendant pour une nouvelle colonne
        }
        filtrerEtAfficher();
    });

    // --- Appel initial ---
    console.log("[App] Appel initial.");
    populerFiltreStatut(); // Populer avant de charger les préférences pour que les options existent
    populerFiltreFournisseur();
    chargerPreferences();   // Charger les préférences (qui pourraient définir les valeurs des filtres)
    filtrerEtAfficher();    // Afficher en fonction des filtres chargés ou par défaut

    console.log("[App] DEBUG: Script End Reached");

}); // Fin DOMContentLoaded
