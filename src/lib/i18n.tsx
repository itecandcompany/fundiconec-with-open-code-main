import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Small, dependency-free i18n layer.
 *
 * A flat dotted-key dictionary rather than nested objects: it keys off
 * `keyof typeof en`, so a missing or misspelled key is a compile error, and
 * declaring `sw` as `Record<TKey, string>` makes an untranslated string fail
 * the build instead of silently shipping English.
 */

export const LANGS = { en: "English", sw: "Kiswahili" } as const;
export type Lang = keyof typeof LANGS;

const en = {
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "common.submit": "Submit",
  "common.total": "Total",
  "common.privacy": "Privacy Policy",
  "common.language": "Language",

  "nav.home": "Home",
  "nav.jobs": "Jobs",
  "nav.help": "Help",
  "nav.account": "Account",

  "landing.badge": "Trusted nearby fundis",
  "landing.title": "Book a fundi like you book a ride.",
  "landing.subtitle":
    "Fast requests, live tracking, upfront pricing, and real people ready to help now.",
  "landing.requestNow": "Request now",
  "landing.driveJobs": "Drive jobs",
  "landing.bookFundi": "Book a fundi",
  "landing.becomeFundi": "Become a fundi",
  "landing.valueVerified": "Verified fundis",
  "landing.valueVerifiedBody": "ID-checked, rated by real customers.",
  "landing.valueTracking": "Live tracking",
  "landing.valueTrackingBody": "Watch your fundi arrive in real time.",
  "landing.valuePricing": "Upfront pricing",
  "landing.valuePricingBody": "Agree the price before work starts.",
  "landing.onlineNow": "{count} online now",
  "landing.noneOnline": "No one online right now",
  "landing.liveAround": "Live around you",
  "landing.active": "{count} active",
  "landing.eta": "5–15 min",
  "landing.noFundis": "No fundis online right now",
  "landing.checkBack": "Check back in a few minutes.",
  "landing.verifiedAway": "Verified · {km} km away",

  "booking.title": "What needs fixing?",
  "booking.subtitle": "Describe it, set your budget, fundis will quote you back.",
  "booking.commonProblems": "Common problems",
  "booking.from": "from {price}",
  "booking.problemPlaceholder": "What's the problem? (e.g. Leaking kitchen sink)",
  "booking.detailsPlaceholder": "More details (optional)",
  "booking.budgetPlaceholder": "Budget (TSh) — suggested {price}",
  "booking.photos": "Photos",
  "booking.photosAdded": "{count}/5 added",
  "booking.photosHint": "Photos help the fundi quote correctly before travelling.",
  "booking.addPhoto": "Add photo",
  "booking.removePhoto": "Remove photo",
  "booking.whenNeeded": "When do you need it?",
  "booking.now": "Now",
  "booking.today": "Today",
  "booking.schedule": "Schedule",
  // No article: "a/an" depends on the next word's sound, which doesn't survive
  // interpolation ("Request a electrician") and has no Swahili equivalent.
  "booking.request": "Request {service}",
  "booking.searching": "Searching for available fundis nearby…",
  "booking.responded": "{count} fundi responded",
  "booking.respondedPlural": "{count} fundis responded",
  "booking.accept": "Accept",
  "booking.cancelRequest": "Cancel request",
  "booking.chat": "Chat",
  "booking.unreadMessages": "{count} unread messages",
  "booking.call": "Call",
  "booking.currentJob": "Current job",
  "booking.kmAway": "{km} km away",
  "booking.jobComplete": "Job complete",
  "booking.totalPaid": "Total paid · {price}",
  "booking.howWas": "How was {name}?",
  "booking.reviewPlaceholder": "Leave a short review (optional)",
  "booking.viewReceipt": "View receipt",
  "booking.quoteDetails": "Quote details",
  "booking.approveQuote": "Approve quote",
  "booking.messageFundi": "Message fundi",
  "booking.fundiNote": "Fundi's note",
  "booking.yourPhotos": "Your job photos",
  "booking.forJob": "For: {title}",
  "booking.before": "Before",
  "booking.after": "After",
  "booking.expand": "Expand",
  "booking.collapse": "Collapse",

  "status.searching": "Finding fundis nearby…",
  "status.quoting": "Review fundi quotes",
  "status.accepted": "Fundi accepted",
  "status.on_the_way": "Fundi is on the way",
  "status.arrived": "Fundi has arrived",
  "status.in_progress": "Job in progress",
  "status.completed": "Job complete",
  "status.cancelled": "Cancelled",

  "jobs.title": "Your jobs",
  "jobs.subtitle": "Everything you've requested, past and present.",
  "jobs.empty": "No jobs yet",
  "jobs.emptyHint": "Request a fundi from the Home tab to get started.",

  "help.title": "Help",
  "help.subtitle": "Answers to common questions.",
  "help.q1": "How do I request a fundi?",
  "help.a1":
    "From the Home tab, pick a service, describe the problem, and set a budget. Nearby fundis will send you quotes — accept one and they'll head your way.",
  "help.q2": "How is pricing decided?",
  "help.a2":
    "You set a budget when you request a job. Fundis quote against it, and you pick the quote you're happiest with before any work starts. FundiFast takes a 10% platform fee from the agreed price.",
  "help.q3": "Can I message or call my fundi?",
  "help.a3":
    "Yes — once a fundi is assigned, Chat and Call are available on the tracking screen for the whole job.",
  "help.q4": "How do I cancel a request?",
  "help.a4":
    'While a job is active, use "Cancel request" on the tracking screen. You\'ll be asked for a short reason, which is shared with the other side.',

  "account.title": "Account",
  "account.noPhone": "No phone on file",
  "account.adminConsole": "Admin console",
  "account.signOut": "Sign out",
  "account.editProfile": "Edit profile",
  "account.fullName": "Full name",
  "account.phone": "Phone",
  "account.phonePlaceholder": "+255…",
  "account.nameRequired": "Enter your name",
  "account.profileUpdated": "Profile updated",
  "account.changePhoto": "Change photo",
  "account.memberSince": "Member since {date}",
  "account.fundiProfile": "Fundi profile",
  "account.editFundiProfile": "Edit",
  "account.rating": "Rating",
  "account.completedJobs": "Jobs done",
  "account.hourlyRate": "Hourly rate",
  "account.fundiSetupIncomplete": "Finish setting up your fundi profile to start getting jobs.",
  "avatar.invalidType": "Use a JPG, PNG, or WEBP image",
  "avatar.tooLarge": "Image must be under 5 MB",

  "fundiSetup.back": "Back",
  "fundiSetup.title": "Fundi setup",
  "fundiSetup.editTitle": "Edit fundi profile",
  "fundiSetup.subtitle": "Pick your trade so we can match you with the right jobs.",
  "fundiSetup.serviceCategory": "Your service category",
  "fundiSetup.avgPrice": "avg {price}",
  "fundiSetup.hourlyRate": "Hourly rate (TSh)",
  "fundiSetup.bio": "Short bio (optional)",
  "fundiSetup.bioPlaceholder": "Years of experience, specialties, languages…",
  "fundiSetup.saveContinue": "Save & continue",
  "fundiSetup.pickService": "Pick a service category",
  "fundiSetup.invalidRate": "Enter a valid hourly rate",
  "fundiSetup.savedEdit": "Profile updated",
  "fundiSetup.savedNew": "You're all set — welcome aboard!",
} as const;

export type TKey = keyof typeof en;

const sw: Record<TKey, string> = {
  "common.loading": "Inapakia…",
  "common.retry": "Jaribu tena",
  "common.cancel": "Ghairi",
  "common.submit": "Wasilisha",
  "common.total": "Jumla",
  "common.privacy": "Sera ya Faragha",
  "common.language": "Lugha",

  "nav.home": "Nyumbani",
  "nav.jobs": "Kazi",
  "nav.help": "Msaada",
  "nav.account": "Akaunti",

  "landing.badge": "Mafundi wa kuaminika karibu nawe",
  "landing.title": "Agiza fundi kama unavyoagiza usafiri.",
  "landing.subtitle":
    "Maombi ya haraka, ufuatiliaji wa moja kwa moja, bei wazi, na watu halisi tayari kukusaidia sasa.",
  "landing.requestNow": "Omba sasa",
  "landing.driveJobs": "Pata kazi",
  "landing.bookFundi": "Agiza fundi",
  "landing.becomeFundi": "Kuwa fundi",
  "landing.valueVerified": "Mafundi waliothibitishwa",
  "landing.valueVerifiedBody": "Vitambulisho vimehakikiwa, wamepimwa na wateja halisi.",
  "landing.valueTracking": "Ufuatiliaji wa moja kwa moja",
  "landing.valueTrackingBody": "Mfuatilie fundi wako anapokuja.",
  "landing.valuePricing": "Bei wazi",
  "landing.valuePricingBody": "Kubaliana bei kabla kazi haijaanza.",
  "landing.onlineNow": "{count} wapo mtandaoni",
  "landing.noneOnline": "Hakuna aliyepo mtandaoni sasa",
  "landing.liveAround": "Walio karibu nawe",
  "landing.active": "{count} hai",
  "landing.eta": "Dakika 5–15",
  "landing.noFundis": "Hakuna fundi mtandaoni sasa",
  "landing.checkBack": "Angalia tena baada ya dakika chache.",
  "landing.verifiedAway": "Amethibitishwa · km {km} kutoka hapa",

  "booking.title": "Nini kinahitaji kurekebishwa?",
  "booking.subtitle": "Eleza tatizo, weka bajeti yako, mafundi watakutumia bei zao.",
  "booking.commonProblems": "Matatizo ya kawaida",
  "booking.from": "kuanzia {price}",
  "booking.problemPlaceholder": "Tatizo ni nini? (mfano: Bomba la jikoni linavuja)",
  "booking.detailsPlaceholder": "Maelezo zaidi (si lazima)",
  "booking.budgetPlaceholder": "Bajeti (TSh) — inapendekezwa {price}",
  "booking.photos": "Picha",
  "booking.photosAdded": "{count}/5 zimeongezwa",
  "booking.photosHint": "Picha humsaidia fundi kupanga bei sahihi kabla ya kusafiri.",
  "booking.addPhoto": "Ongeza picha",
  "booking.removePhoto": "Ondoa picha",
  "booking.whenNeeded": "Unaihitaji lini?",
  "booking.now": "Sasa",
  "booking.today": "Leo",
  "booking.schedule": "Panga muda",
  "booking.request": "Omba {service}",
  "booking.searching": "Tunatafuta mafundi waliopo karibu nawe…",
  "booking.responded": "Fundi {count} amejibu",
  "booking.respondedPlural": "Mafundi {count} wamejibu",
  "booking.accept": "Kubali",
  "booking.cancelRequest": "Ghairi ombi",
  "booking.chat": "Ujumbe",
  "booking.unreadMessages": "Ujumbe {count} usiosomwa",
  "booking.call": "Piga simu",
  "booking.currentJob": "Kazi ya sasa",
  "booking.kmAway": "km {km} kutoka hapa",
  "booking.jobComplete": "Kazi imekamilika",
  "booking.totalPaid": "Jumla iliyolipwa · {price}",
  "booking.howWas": "{name} alifanyaje?",
  "booking.reviewPlaceholder": "Acha maoni mafupi (si lazima)",
  "booking.viewReceipt": "Ona risiti",
  "booking.quoteDetails": "Maelezo ya bei",
  "booking.approveQuote": "Kubali bei",
  "booking.messageFundi": "Mtumie fundi ujumbe",
  "booking.fundiNote": "Maelezo ya fundi",
  "booking.yourPhotos": "Picha zako za kazi",
  "booking.forJob": "Kwa: {title}",
  "booking.before": "Kabla",
  "booking.after": "Baada",
  "booking.expand": "Panua",
  "booking.collapse": "Kunja",

  "status.searching": "Tunatafuta mafundi karibu nawe…",
  "status.quoting": "Pitia bei za mafundi",
  "status.accepted": "Fundi amekubali",
  "status.on_the_way": "Fundi yuko njiani",
  "status.arrived": "Fundi amefika",
  "status.in_progress": "Kazi inaendelea",
  "status.completed": "Kazi imekamilika",
  "status.cancelled": "Imeghairiwa",

  "jobs.title": "Kazi zako",
  "jobs.subtitle": "Kila ulichoomba, cha zamani na cha sasa.",
  "jobs.empty": "Bado hakuna kazi",
  "jobs.emptyHint": "Omba fundi kutoka kichupo cha Nyumbani ili kuanza.",

  "help.title": "Msaada",
  "help.subtitle": "Majibu ya maswali ya kawaida.",
  "help.q1": "Ninawezaje kuomba fundi?",
  "help.a1":
    "Kutoka kichupo cha Nyumbani, chagua huduma, eleza tatizo, na weka bajeti. Mafundi walio karibu watakutumia bei zao — kubali moja nao watakuja kwako.",
  "help.q2": "Bei hupangwaje?",
  "help.a2":
    "Wewe huweka bajeti unapoomba kazi. Mafundi hutoa bei zao, nawe huchagua unayoipenda kabla kazi haijaanza. FundiFast huchukua asilimia 10 ya bei mliyokubaliana.",
  "help.q3": "Naweza kumtumia ujumbe au kumpigia fundi wangu?",
  "help.a3":
    "Ndiyo — mara fundi anapopangwa, Ujumbe na Simu vinapatikana kwenye skrini ya ufuatiliaji kwa muda wote wa kazi.",
  "help.q4": "Ninawezaje kughairi ombi?",
  "help.a4":
    'Wakati kazi ikiwa hai, tumia "Ghairi ombi" kwenye skrini ya ufuatiliaji. Utaulizwa sababu fupi, ambayo hushirikiwa na upande mwingine.',

  "account.title": "Akaunti",
  "account.noPhone": "Hakuna namba ya simu",
  "account.adminConsole": "Kidhibiti cha msimamizi",
  "account.signOut": "Toka",
  "account.editProfile": "Hariri wasifu",
  "account.fullName": "Jina kamili",
  "account.phone": "Simu",
  "account.phonePlaceholder": "+255…",
  "account.nameRequired": "Weka jina lako",
  "account.profileUpdated": "Wasifu umesasishwa",
  "account.changePhoto": "Badilisha picha",
  "account.memberSince": "Mwanachama tangu {date}",
  "account.fundiProfile": "Wasifu wa fundi",
  "account.editFundiProfile": "Hariri",
  "account.rating": "Kiwango",
  "account.completedJobs": "Kazi zilizokamilika",
  "account.hourlyRate": "Bei kwa saa",
  "account.fundiSetupIncomplete": "Maliza kuweka wasifu wako wa fundi ili uanze kupata kazi.",
  "avatar.invalidType": "Tumia picha ya JPG, PNG, au WEBP",
  "avatar.tooLarge": "Picha lazima iwe chini ya MB 5",

  "fundiSetup.back": "Rudi",
  "fundiSetup.title": "Kuweka wasifu wa fundi",
  "fundiSetup.editTitle": "Hariri wasifu wa fundi",
  "fundiSetup.subtitle": "Chagua ufundi wako ili tukulinganishe na kazi zinazofaa.",
  "fundiSetup.serviceCategory": "Aina ya huduma yako",
  "fundiSetup.avgPrice": "wastani {price}",
  "fundiSetup.hourlyRate": "Bei kwa saa (TSh)",
  "fundiSetup.bio": "Maelezo mafupi (si lazima)",
  "fundiSetup.bioPlaceholder": "Miaka ya uzoefu, utaalamu, lugha…",
  "fundiSetup.saveContinue": "Hifadhi & Endelea",
  "fundiSetup.pickService": "Chagua aina ya huduma",
  "fundiSetup.invalidRate": "Weka bei sahihi kwa saa",
  "fundiSetup.savedEdit": "Wasifu umesasishwa",
  "fundiSetup.savedNew": "Umekamilisha usajili — karibu!",
};

const DICTS: Record<Lang, Record<TKey, string>> = { en, sw };

const STORAGE_KEY = "fundifast-lang";

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "sw";
}

function detectLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Private-mode Safari throws on localStorage access; fall through.
  }
  return navigator.language?.toLowerCase().startsWith("sw") ? "sw" : "en";
}

export type TFunc = (key: TKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start on `en` so the server-rendered markup and the first client
  // render agree; the real preference is applied right after mount.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const detected = detectLang();
    if (detected !== "en") setLangState(detected);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference just won't persist — not worth failing the switch over.
    }
  }, []);

  const t = useCallback<TFunc>(
    (key, vars) => {
      const raw = DICTS[lang][key] ?? en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience for the common case of only needing the translate function. */
export function useT(): TFunc {
  return useI18n().t;
}
