// Testi dell'app operai in italiano, rumeno e albanese.
export const LANGS = [
  { code: "it", label: "Italiano", short: "IT" },
  { code: "ro", label: "Română", short: "RO" },
  { code: "sq", label: "Shqip", short: "SQ" },
];

export const T = {
  it: {
    ciao: "Ciao", oggi: "Oggi", foto: "Foto", ore: "Ore", altro: "Altro", timbra: "Timbra",
    timbratura: "Timbratura", entrata: "Timbra l'entrata", uscita: "Timbra l'uscita", entrato_alle: "Entrato alle", uscito_alle: "Uscito alle", non_timbrato: "Non hai ancora timbrato oggi",
    ore_oggi: "ore oggi", cantiere: "Cantiere", nessun_cantiere: "Nessun cantiere (magazzino, ufficio…)", posizione_info: "Alla timbratura viene registrata la tua posizione, solo in quel momento.",
    in_attesa_rete: "in attesa di connessione", ev_entrata: "Entrata", ev_uscita: "Uscita", entrata_ok: "Entrata registrata", uscita_ok: "Uscita registrata", offline_ok: "Sei senza rete: partirà da sola appena torna la connessione.",
    i_tuoi_cantieri: "I tuoi cantieri", nessun_cantiere_assegnato: "Non sei ancora assegnato a un cantiere: chiedi al tuo capo.", naviga: "Naviga", chiama_capo: "Chiama il capocantiere",
    capocantiere: "Capocantiere", squadra: "Squadra", mezzi: "Mezzi", pos_da_firmare: "POS da firmare", firma_ora: "Firma ora", firmato: "Firmato",
    avvisi: "Avvisi", nuovi_avvisi: "nuovi avvisi", segna_letto: "Ho letto", letto: "Letto", firma_richiesta: "Richiede la tua firma", firma: "Firma", traduci: "Traduci",
    scatta_foto: "Scatta foto", scegli_cantiere: "Scegli il cantiere", fase: "Fase", prima: "Prima", durante: "Durante", dopo: "Dopo", didascalia: "Descrizione (facoltativa)", invia: "Invia",
    foto_inviate: "Foto inviate", foto_offline: "Foto salvate sul telefono: partiranno appena torna la rete.",
    bolla: "Bolla (DDT)", carica_bolla: "Fotografa la bolla", leggo_bolla: "Leggo la bolla…", fornitore: "Fornitore", materiali: "Materiali", registra_bolla: "Registra la bolla", bolla_ok: "Bolla registrata",
    segnala: "Segnala", segnala_problema: "Segnala un problema", tipo: "Tipo", t_materiale: "Manca materiale", t_guasto: "Guasto a un mezzo", t_sicurezza: "Sicurezza / quasi incidente", t_infortunio: "Infortunio", t_altro: "Altro",
    urgente: "Urgente", cosa_succede: "Cosa succede?", parla: "Tieni premuto e parla", registrando: "Sto registrando… rilascia per finire", trascrivo: "Trascrivo…", aggiungi_foto: "Aggiungi foto",
    segnalazione_ok: "Segnalazione inviata al capo", le_tue_segnalazioni: "Le tue segnalazioni", aperta: "Aperta", chiusa: "Risolta",
    le_mie_ore: "Le mie ore", ore_mese: "Ore del mese", giorni_lavorati: "Giorni lavorati", straordinari: "Straordinari", ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", assente: "Assente", presente: "Presente",
    richieste: "Richieste", nuova_richiesta: "Nuova richiesta", dal: "Dal", al: "Al", note: "Note", certificato: "Numero certificato (INPS)", richiesta_ok: "Richiesta inviata",
    in_attesa: "In attesa", approvata: "Approvata", respinta: "Respinta",
    documenti: "Documenti", buste_paga: "Buste paga", corsi_visite: "Corsi e visite", scade: "scade", scaduto: "scaduto", tesserino: "Tesserino di cantiere", nessun_documento: "Nessun documento",
    firme: "Firme", dpi_consegnati: "DPI ricevuti", firma_consegna: "Firma la consegna", i_miei_mezzi: "I miei mezzi", km_ore: "Km o ore attuali", aggiorna: "Aggiorna", segnala_guasto: "Segnala guasto",
    lingua: "Lingua", esci: "Esci", annulla: "Annulla", salva: "Salva", errore: "Qualcosa non ha funzionato", riprova: "Riprova", nessuno: "Nessuno",
  },
  ro: {
    ciao: "Salut", oggi: "Azi", foto: "Poze", ore: "Ore", altro: "Altele", timbra: "Pontaj",
    timbratura: "Pontaj", entrata: "Pontează intrarea", uscita: "Pontează ieșirea", entrato_alle: "Intrat la", uscito_alle: "Ieșit la", non_timbrato: "Nu te-ai pontat încă azi",
    ore_oggi: "ore azi", cantiere: "Șantier", nessun_cantiere: "Fără șantier (depozit, birou…)", posizione_info: "La pontaj se înregistrează poziția ta, doar în acel moment.",
    in_attesa_rete: "așteaptă conexiunea", ev_entrata: "Intrare", ev_uscita: "Ieșire", entrata_ok: "Intrare înregistrată", uscita_ok: "Ieșire înregistrată", offline_ok: "Nu ai semnal: se trimite singur când revine conexiunea.",
    i_tuoi_cantieri: "Șantierele tale", nessun_cantiere_assegnato: "Nu ești încă repartizat pe un șantier: întreabă-l pe șeful tău.", naviga: "Navighează", chiama_capo: "Sună șeful de șantier",
    capocantiere: "Șef de șantier", squadra: "Echipa", mezzi: "Utilaje", pos_da_firmare: "POS de semnat", firma_ora: "Semnează acum", firmato: "Semnat",
    avvisi: "Anunțuri", nuovi_avvisi: "anunțuri noi", segna_letto: "Am citit", letto: "Citit", firma_richiesta: "Necesită semnătura ta", firma: "Semnează", traduci: "Tradu",
    scatta_foto: "Fă o poză", scegli_cantiere: "Alege șantierul", fase: "Etapa", prima: "Înainte", durante: "În timpul", dopo: "După", didascalia: "Descriere (opțional)", invia: "Trimite",
    foto_inviate: "Poze trimise", foto_offline: "Poze salvate pe telefon: se trimit când revine semnalul.",
    bolla: "Aviz de însoțire (DDT)", carica_bolla: "Fotografiază avizul", leggo_bolla: "Citesc avizul…", fornitore: "Furnizor", materiali: "Materiale", registra_bolla: "Înregistrează avizul", bolla_ok: "Aviz înregistrat",
    segnala: "Raportează", segnala_problema: "Raportează o problemă", tipo: "Tip", t_materiale: "Lipsește material", t_guasto: "Defecțiune utilaj", t_sicurezza: "Siguranță / aproape accident", t_infortunio: "Accident de muncă", t_altro: "Altceva",
    urgente: "Urgent", cosa_succede: "Ce se întâmplă?", parla: "Ține apăsat și vorbește", registrando: "Înregistrez… eliberează pentru a termina", trascrivo: "Transcriu…", aggiungi_foto: "Adaugă poze",
    segnalazione_ok: "Raport trimis șefului", le_tue_segnalazioni: "Rapoartele tale", aperta: "Deschis", chiusa: "Rezolvat",
    le_mie_ore: "Orele mele", ore_mese: "Ore în lună", giorni_lavorati: "Zile lucrate", straordinari: "Ore suplimentare", ferie: "Concediu", permesso: "Învoire", malattia: "Boală", assente: "Absent", presente: "Prezent",
    richieste: "Cereri", nuova_richiesta: "Cerere nouă", dal: "De la", al: "Până la", note: "Note", certificato: "Număr certificat medical", richiesta_ok: "Cerere trimisă",
    in_attesa: "În așteptare", approvata: "Aprobată", respinta: "Respinsă",
    documenti: "Documente", buste_paga: "Fluturași de salariu", corsi_visite: "Cursuri și vizite medicale", scade: "expiră", scaduto: "expirat", tesserino: "Legitimație de șantier", nessun_documento: "Niciun document",
    firme: "Semnături", dpi_consegnati: "EIP primite", firma_consegna: "Semnează primirea", i_miei_mezzi: "Utilajele mele", km_ore: "Km sau ore actuale", aggiorna: "Actualizează", segnala_guasto: "Raportează defecțiune",
    lingua: "Limba", esci: "Ieși", annulla: "Anulează", salva: "Salvează", errore: "Ceva nu a funcționat", riprova: "Reîncearcă", nessuno: "Niciunul",
  },
  sq: {
    ciao: "Përshëndetje", oggi: "Sot", foto: "Foto", ore: "Orë", altro: "Të tjera", timbra: "Regjistro",
    timbratura: "Regjistrimi i orarit", entrata: "Regjistro hyrjen", uscita: "Regjistro daljen", entrato_alle: "Hyrë në", uscito_alle: "Dalë në", non_timbrato: "Nuk je regjistruar ende sot",
    ore_oggi: "orë sot", cantiere: "Kantieri", nessun_cantiere: "Pa kantier (magazinë, zyrë…)", posizione_info: "Gjatë regjistrimit ruhet vendndodhja jote, vetëm në atë moment.",
    in_attesa_rete: "në pritje të lidhjes", ev_entrata: "Hyrje", ev_uscita: "Dalje", entrata_ok: "Hyrja u regjistrua", uscita_ok: "Dalja u regjistrua", offline_ok: "Je pa internet: do të dërgohet vetë kur të kthehet lidhja.",
    i_tuoi_cantieri: "Kantieret e tu", nessun_cantiere_assegnato: "Nuk je caktuar ende në një kantier: pyet shefin tënd.", naviga: "Navigo", chiama_capo: "Telefono përgjegjësin e kantierit",
    capocantiere: "Përgjegjësi i kantierit", squadra: "Ekipi", mezzi: "Mjetet", pos_da_firmare: "POS për të nënshkruar", firma_ora: "Nënshkruaj tani", firmato: "Nënshkruar",
    avvisi: "Njoftime", nuovi_avvisi: "njoftime të reja", segna_letto: "E lexova", letto: "Lexuar", firma_richiesta: "Kërkon nënshkrimin tënd", firma: "Nënshkruaj", traduci: "Përkthe",
    scatta_foto: "Bëj foto", scegli_cantiere: "Zgjidh kantierin", fase: "Faza", prima: "Para", durante: "Gjatë", dopo: "Pas", didascalia: "Përshkrim (opsional)", invia: "Dërgo",
    foto_inviate: "Fotot u dërguan", foto_offline: "Fotot u ruajtën në telefon: do të dërgohen kur të kthehet interneti.",
    bolla: "Fletë shoqëruese (DDT)", carica_bolla: "Fotografo fletën", leggo_bolla: "Po lexoj fletën…", fornitore: "Furnizuesi", materiali: "Materialet", registra_bolla: "Regjistro fletën", bolla_ok: "Fleta u regjistrua",
    segnala: "Sinjalizo", segnala_problema: "Sinjalizo një problem", tipo: "Lloji", t_materiale: "Mungon material", t_guasto: "Defekt i një mjeti", t_sicurezza: "Siguri / gati aksident", t_infortunio: "Aksident në punë", t_altro: "Tjetër",
    urgente: "Urgjent", cosa_succede: "Çfarë po ndodh?", parla: "Mbaj shtypur dhe fol", registrando: "Po regjistroj… lësho për të mbaruar", trascrivo: "Po e shkruaj…", aggiungi_foto: "Shto foto",
    segnalazione_ok: "Sinjalizimi u dërgua te shefi", le_tue_segnalazioni: "Sinjalizimet e tua", aperta: "Hapur", chiusa: "Zgjidhur",
    le_mie_ore: "Orët e mia", ore_mese: "Orë në muaj", giorni_lavorati: "Ditë pune", straordinari: "Orë shtesë", ferie: "Pushime", permesso: "Leje", malattia: "Sëmundje", assente: "Mungon", presente: "Prezent",
    richieste: "Kërkesa", nuova_richiesta: "Kërkesë e re", dal: "Nga", al: "Deri", note: "Shënime", certificato: "Numri i raportit mjekësor", richiesta_ok: "Kërkesa u dërgua",
    in_attesa: "Në pritje", approvata: "Miratuar", respinta: "Refuzuar",
    documenti: "Dokumente", buste_paga: "Fletëpagesat", corsi_visite: "Kurse dhe vizita mjekësore", scade: "skadon", scaduto: "skaduar", tesserino: "Karta e kantierit", nessun_documento: "Asnjë dokument",
    firme: "Nënshkrime", dpi_consegnati: "Mjetet mbrojtëse të marra", firma_consegna: "Nënshkruaj marrjen", i_miei_mezzi: "Mjetet e mia", km_ore: "Km ose orë aktuale", aggiorna: "Përditëso", segnala_guasto: "Sinjalizo defekt",
    lingua: "Gjuha", esci: "Dil", annulla: "Anulo", salva: "Ruaj", errore: "Diçka nuk funksionoi", riprova: "Provo përsëri", nessuno: "Asnjë",
  },
};

const KEY = "talo.operaio.lingua";
export const savedLang = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const saveLang = (l) => { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } };
export const translator = (lang) => (k) => T[lang]?.[k] ?? T.it[k] ?? k;
export const LANG_NAMES = { it: "italiano", ro: "rumeno", sq: "albanese" };
