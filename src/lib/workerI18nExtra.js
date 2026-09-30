// App operai: testi dei moduli specifici e dell'assistente IA (italiano, rumeno, albanese).
export const EXTRA = {
  it: {
    ai_compila: "Compila con l'IA", ai_compilo: "L'IA sta compilando…", ai_fatto: "Campi compilati: controlla e invia", ai_descrivi: "Descrivi con l'IA", ai_descrivo: "Guardo la foto…",
    ai_parla_richiesta: "Dimmelo a voce", ai_hint_segnala: "Parla nella tua lingua: l'IA scrive, traduce per il capo e compila i campi.",
    oggi_data: "Oggi è", dettagli: "Dettagli", facoltativo: "facoltativo",
    // manca materiale
    materiale: "Materiale", materiale_ph: "Es. sacchi di cemento, tubi Ø 32", quantita: "Quantità", quantita_ph: "Es. 20 sacchi", serve_entro: "Serve entro",
    entro_oggi: "Oggi", entro_domani: "Domani", entro_settimana: "Questa settimana",
    // guasto
    mezzo: "Mezzo o attrezzo", scegli_mezzo: "Scegli il mezzo", mezzo_altro: "Altro (scrivilo sotto)", stato_mezzo: "Il mezzo è", fermo_si: "Fermo, non si usa", fermo_no: "Funziona ancora",
    // sicurezza
    categoria: "Categoria", cat_caduta: "Caduta dall'alto", cat_ponteggio: "Ponteggio / parapetti", cat_scavo: "Scavo", cat_elettrico: "Impianto elettrico", cat_attrezzi: "Macchine / attrezzi",
    cat_carichi: "Carichi sospesi", cat_dpi: "DPI mancanti", cat_ordine: "Ordine e passaggi", cat_altro: "Altro",
    evento: "Cosa è successo", ev_pericolo: "Situazione pericolosa", ev_quasi: "Quasi incidente",
    // infortunio
    chi_ferito: "Chi si è fatto male", io: "Io", collega: "Un collega", nome_collega: "Nome del collega", parte_corpo: "Parte del corpo",
    p_testa: "Testa", p_occhi: "Occhi", p_mani: "Mani", p_braccia: "Braccia", p_schiena: "Schiena", p_gambe: "Gambe", p_piedi: "Piedi", p_altro: "Altro",
    soccorso: "È servito il soccorso?", si: "Sì", no: "No", ora_evento: "A che ora", emergenza: "Emergenza grave? Chiama subito il 112", chiama_112: "Chiama 112",
    // foto
    lavorazione: "Lavorazione", lav_scavi: "Scavi", lav_fondazioni: "Fondazioni", lav_strutture: "Strutture / c.a.", lav_murature: "Murature", lav_impianti: "Impianti", lav_intonaci: "Intonaci / cartongesso",
    lav_pavimenti: "Pavimenti / massetti", lav_copertura: "Copertura", lav_serramenti: "Serramenti", lav_finiture: "Finiture / pitture", lav_sicurezza: "Sicurezza", lav_materiali: "Materiale arrivato", lav_altro: "Altro",
    // bolla
    numero_bolla: "Numero bolla", data_bolla: "Data", consegna: "Consegna", conforme: "Tutto a posto", non_conforme: "Ci sono problemi", problemi_ph: "Cosa manca o è danneggiato?", aggiungi_riga: "Aggiungi materiale", descrizione: "Descrizione", unita: "Unità",
    // richieste
    dalle: "Dalle", alle: "Alle", giorni_lavorativi: "giorni lavorativi", ore_permesso: "ore di permesso", protocollo: "Numero di protocollo del certificato", protocollo_hint: "Lo trovi sul certificato del medico (PUC).", motivo: "Motivo",
    // mezzi
    ultimo_valore: "Ultimo valore", valore_basso: "È più basso dell'ultimo valore: controlla", scadenze: "Scadenze", sc_revisione: "Revisione", sc_assicurazione: "Assicurazione", sc_bollo: "Bollo", sc_verifica_periodica: "Verifica periodica", sc_manutenzione: "Manutenzione",
    // avvisi
    ascolta: "Ascolta", ferma: "Ferma", testo_originale: "Testo originale", traduzione_auto: "Tradotto automaticamente",
  },
  ro: {
    ai_compila: "Completează cu IA", ai_compilo: "IA completează…", ai_fatto: "Câmpuri completate: verifică și trimite", ai_descrivi: "Descrie cu IA", ai_descrivo: "Mă uit la poză…",
    ai_parla_richiesta: "Spune-mi cu vocea", ai_hint_segnala: "Vorbește în limba ta: IA scrie, traduce pentru șef și completează câmpurile.",
    oggi_data: "Azi este", dettagli: "Detalii", facoltativo: "opțional",
    materiale: "Material", materiale_ph: "Ex. saci de ciment, țevi Ø 32", quantita: "Cantitate", quantita_ph: "Ex. 20 de saci", serve_entro: "E nevoie până",
    entro_oggi: "Azi", entro_domani: "Mâine", entro_settimana: "Săptămâna asta",
    mezzo: "Utilaj sau unealtă", scegli_mezzo: "Alege utilajul", mezzo_altro: "Altul (scrie mai jos)", stato_mezzo: "Utilajul este", fermo_si: "Oprit, nu se folosește", fermo_no: "Încă funcționează",
    categoria: "Categorie", cat_caduta: "Cădere de la înălțime", cat_ponteggio: "Schelă / balustrade", cat_scavo: "Săpătură", cat_elettrico: "Instalație electrică", cat_attrezzi: "Utilaje / unelte",
    cat_carichi: "Sarcini suspendate", cat_dpi: "Lipsă EIP", cat_ordine: "Ordine și căi de acces", cat_altro: "Altceva",
    evento: "Ce s-a întâmplat", ev_pericolo: "Situație periculoasă", ev_quasi: "Aproape accident",
    chi_ferito: "Cine s-a rănit", io: "Eu", collega: "Un coleg", nome_collega: "Numele colegului", parte_corpo: "Partea corpului",
    p_testa: "Cap", p_occhi: "Ochi", p_mani: "Mâini", p_braccia: "Brațe", p_schiena: "Spate", p_gambe: "Picioare", p_piedi: "Tălpi", p_altro: "Altceva",
    soccorso: "A fost nevoie de ambulanță?", si: "Da", no: "Nu", ora_evento: "La ce oră", emergenza: "Urgență gravă? Sună imediat la 112", chiama_112: "Sună 112",
    lavorazione: "Lucrare", lav_scavi: "Săpături", lav_fondazioni: "Fundații", lav_strutture: "Structuri / beton armat", lav_murature: "Zidărie", lav_impianti: "Instalații", lav_intonaci: "Tencuieli / rigips",
    lav_pavimenti: "Pardoseli / șape", lav_copertura: "Acoperiș", lav_serramenti: "Tâmplărie", lav_finiture: "Finisaje / vopsitorie", lav_sicurezza: "Siguranță", lav_materiali: "Material sosit", lav_altro: "Altceva",
    numero_bolla: "Număr aviz", data_bolla: "Data", consegna: "Livrare", conforme: "Totul e în regulă", non_conforme: "Sunt probleme", problemi_ph: "Ce lipsește sau e deteriorat?", aggiungi_riga: "Adaugă material", descrizione: "Descriere", unita: "Unitate",
    dalle: "De la", alle: "Până la", giorni_lavorativi: "zile lucrătoare", ore_permesso: "ore de învoire", protocollo: "Numărul de protocol al certificatului", protocollo_hint: "Îl găsești pe certificatul medicului.", motivo: "Motiv",
    ultimo_valore: "Ultima valoare", valore_basso: "Este mai mică decât ultima valoare: verifică", scadenze: "Scadențe", sc_revisione: "Inspecție tehnică (ITP)", sc_assicurazione: "Asigurare", sc_bollo: "Taxă auto", sc_verifica_periodica: "Verificare periodică", sc_manutenzione: "Întreținere",
    ascolta: "Ascultă", ferma: "Oprește", testo_originale: "Textul original", traduzione_auto: "Tradus automat",
  },
  sq: {
    ai_compila: "Plotëso me IA", ai_compilo: "IA po plotëson…", ai_fatto: "Fushat u plotësuan: kontrollo dhe dërgo", ai_descrivi: "Përshkruaj me IA", ai_descrivo: "Po shoh foton…",
    ai_parla_richiesta: "Ma thuaj me zë", ai_hint_segnala: "Fol në gjuhën tënde: IA shkruan, përkthen për shefin dhe plotëson fushat.",
    oggi_data: "Sot është", dettagli: "Detaje", facoltativo: "opsionale",
    materiale: "Materiali", materiale_ph: "P.sh. thasë çimento, tuba Ø 32", quantita: "Sasia", quantita_ph: "P.sh. 20 thasë", serve_entro: "Duhet deri",
    entro_oggi: "Sot", entro_domani: "Nesër", entro_settimana: "Këtë javë",
    mezzo: "Mjeti ose vegla", scegli_mezzo: "Zgjidh mjetin", mezzo_altro: "Tjetër (shkruaje më poshtë)", stato_mezzo: "Mjeti është", fermo_si: "I ndalur, nuk përdoret", fermo_no: "Ende funksionon",
    categoria: "Kategoria", cat_caduta: "Rënie nga lartësia", cat_ponteggio: "Skela / parmakë", cat_scavo: "Gërmim", cat_elettrico: "Instalim elektrik", cat_attrezzi: "Makineri / vegla",
    cat_carichi: "Ngarkesa të varura", cat_dpi: "Mungojnë mjetet mbrojtëse", cat_ordine: "Rregull dhe kalime", cat_altro: "Tjetër",
    evento: "Çfarë ndodhi", ev_pericolo: "Situatë e rrezikshme", ev_quasi: "Gati aksident",
    chi_ferito: "Kush u lëndua", io: "Unë", collega: "Një koleg", nome_collega: "Emri i kolegut", parte_corpo: "Pjesa e trupit",
    p_testa: "Koka", p_occhi: "Sytë", p_mani: "Duart", p_braccia: "Krahët", p_schiena: "Shpina", p_gambe: "Këmbët", p_piedi: "Shputat", p_altro: "Tjetër",
    soccorso: "U desh ndihma e shpejtë?", si: "Po", no: "Jo", ora_evento: "Në çfarë ore", emergenza: "Urgjencë e rëndë? Telefono menjëherë 112", chiama_112: "Telefono 112",
    lavorazione: "Punimi", lav_scavi: "Gërmime", lav_fondazioni: "Themele", lav_strutture: "Struktura / beton arme", lav_murature: "Muratura", lav_impianti: "Impiante", lav_intonaci: "Suva / kartongips",
    lav_pavimenti: "Dysheme / masete", lav_copertura: "Çati", lav_serramenti: "Dyer dhe dritare", lav_finiture: "Përfundime / bojë", lav_sicurezza: "Siguria", lav_materiali: "Material i ardhur", lav_altro: "Tjetër",
    numero_bolla: "Numri i fletëdërgesës", data_bolla: "Data", consegna: "Dorëzimi", conforme: "Gjithçka në rregull", non_conforme: "Ka probleme", problemi_ph: "Çfarë mungon ose është dëmtuar?", aggiungi_riga: "Shto material", descrizione: "Përshkrimi", unita: "Njësia",
    dalle: "Nga ora", alle: "Deri në orën", giorni_lavorativi: "ditë pune", ore_permesso: "orë leje", protocollo: "Numri i protokollit të certifikatës", protocollo_hint: "E gjen te certifikata e mjekut.", motivo: "Arsyeja",
    ultimo_valore: "Vlera e fundit", valore_basso: "Është më e ulët se vlera e fundit: kontrollo", scadenze: "Afatet", sc_revisione: "Kolaudimi", sc_assicurazione: "Sigurimi", sc_bollo: "Taksa e automjetit", sc_verifica_periodica: "Kontrolli periodik", sc_manutenzione: "Mirëmbajtja",
    ascolta: "Dëgjo", ferma: "Ndalo", testo_originale: "Teksti origjinal", traduzione_auto: "Përkthyer automatikisht",
  },
};
