import { useNavigate } from 'react-router-dom';
import {
  Building2, CalendarDays, UserCog, GraduationCap, BookOpen, Users, Coins,
  ClipboardList, RefreshCw, Archive, CheckCircle2, ArrowRight, Lightbulb,
  AlertTriangle, Rocket, ListOrdered,
} from 'lucide-react';

interface Step {
  n: number;
  icon: React.ElementType;
  title: string;
  where: string;
  route: string;
  goal: string;
  mustDo: string[];
  before: string;
  after: string[];
}

const STEPS: Step[] = [
  {
    n: 1,
    icon: Building2,
    title: "Compléter l'identité de l'établissement",
    where: 'Paramètres → Établissement',
    route: '/settings',
    goal:
      "Renseigner toutes les informations qui apparaîtront automatiquement en en-tête et en pied de page de vos documents officiels : bulletins de notes, reçus de paiement et certificats de scolarité.",
    mustDo: [
      "Onglet « Général » : nom officiel, adresse, ville, téléphone, e-mail.",
      "Onglet « Identité » : logo, tampon (cachet), signature du chef d'établissement.",
      "Ministère de tutelle, titre du responsable (ex. Directeur), nom du responsable, slogan, numéro d'enregistrement.",
      "Vérifiez l'aperçu : chaque document doit afficher un en-tête correct.",
    ],
    before:
      "À faire EN PREMIER : tant que l'identité n'est pas complète, tous les documents imprimés porteront un en-tête vide ou générique.",
    after: [
      'Les bulletins, reçus et certificats sont prêts à porter vos vraies informations.',
      'Le nom de l\'établissement apparaît dans la barre latérale.',
    ],
  },
  {
    n: 2,
    icon: CalendarDays,
    title: "Créer et activer l'année scolaire",
    where: 'Paramètres → Années scolaires',
    route: '/settings',
    goal:
      "Définir l'année de travail (ex. 2026-2027). Toute donnée de l'application (classes, élèves, notes, paiements) est rattachée à une année : sans année active, rien ne peut être saisi.",
    mustDo: [
      "Cliquez sur « Nouvelle année » et choisissez un nom (ex. 2026-2027) + date de début et de fin.",
      "Activez l'année via le bouton « Ouvrir l'année » (statut = Active).",
      "Vérifiez en haut de la barre latérale que la bonne année est sélectionnée.",
    ],
    before:
      "Doit être fait AVANT de créer les classes et d'inscrire les élèves : un élève ou une classe appartient toujours à une année précise.",
    after: [
      'Vous pouvez créer des classes pour cette année.',
      'Le sélecteur d\'année (barre latérale) permet de basculer entre les années.',
    ],
  },
  {
    n: 3,
    icon: UserCog,
    title: 'Enregistrer le personnel (professeurs & staff)',
    where: 'Personnel',
    route: '/personnel',
    goal:
      "Constituer le répertoire des enseignants et du personnel administratif, avec leurs coordonnées et pièces. Ces fiches serviront ensuite à désigner les professeurs titulaires et à affecter les matières.",
    mustDo: [
      "Ajoutez chaque enseignant (nom, prénoms, sexe, fonction, matricule, contact).",
      "Ajoutez aussi la secrétaire, le comptable et les autres membres du personnel.",
      "Vous pourrez générer leurs attestations / certificats de travail depuis leur fiche.",
    ],
    before:
      "Doit être fait AVANT d'assigner un professeur titulaire à une classe ou un professeur à une matière.",
    after: [
      'Les enseignants sont sélectionnables dans les formulaires « Classe » et « Matière ».',
    ],
  },
  {
    n: 4,
    icon: GraduationCap,
    title: 'Créer les classes et leurs périodes',
    where: 'Gestion des classes',
    route: '/classes',
    goal:
      "Créer les classes de l'année (ex. 6ème A, Terminale D) et définir leur découpage en périodes (trimestres ou semestres). C'est l'ossature pédagogique dans laquelle les élèves seront inscrits.",
    mustDo: [
      "Cliquez sur « Nouvelle classe », saisissez le nom et le niveau (Section / Série si votre structure est définie).",
      "Choisissez un professeur titulaire (optionnel) — il doit déjà exister (étape 3).",
      "Passez à l'étape « Périodes » et utilisez un modèle rapide (Trimestres / Semestres) ou définissez-les manuellement.",
      "Répétez pour toutes les classes de l'année.",
    ],
    before:
      "Doit être fait AVANT d'inscrire les élèves (un élève est inscrit dans une classe) et AVANT d'affecter des matières.",
    after: [
      'Les classes apparaissent avec leur nombre de périodes.',
      'Les classes sont sélectionnables lors des inscriptions (étape 6).',
    ],
  },
  {
    n: 5,
    icon: BookOpen,
    title: 'Définir les matières et les affecter aux classes',
    where: 'Pédagogie & Notes',
    route: '/pedagogie',
    goal:
      "Créer la liste des matières enseignées, puis les affecter à chaque classe en précisant le professeur, le coefficient et la charge horaire. On définit aussi les types d'évaluation (devoir, composition…) et les périodes de notation.",
    mustDo: [
      "Onglet « Matières » : créez chaque matière (nom, code, éventuellement couleur / icône).",
      "Onglet « Affectations » : pour chaque classe, ajoutez les matières, le professeur affecté (étape 3), le coefficient et les heures.",
      "Vérifiez / créez les types d'évaluation (ex. Devoir, Composition) et les périodes de notation.",
    ],
    before:
      "Doit être fait AVANT de saisir les notes : une note est toujours liée à une matière, une classe et un type d'évaluation.",
    after: [
      'Chaque classe dispose de son programme de matières et de professeurs affectés.',
      'Vous pouvez saisir des évaluations et des notes.',
    ],
  },
  {
    n: 6,
    icon: Users,
    title: 'Inscrire les élèves',
    where: 'Élèves & Inscriptions',
    route: '/students',
    goal:
      "Enregistrer les élèves et les inscrire dans une classe de l'année active. On peut aussi faire les changements de classe / passages d'année depuis cet écran.",
    mustDo: [
      "Ajoutez chaque élève : nom, prénoms, sexe, date et lieu de naissance, tutelle (parent/tuteur), contact, photo.",
      "Inscrivez-le dans sa classe pour l'année active (la classe doit exister — étape 4).",
      "Pour un élève venant d'une autre classe/année, utilisez le module de migration / passage d'année.",
    ],
    before:
      "Doit être fait APRÈS les classes (étape 4) et AVANT les paiements (étape 7) et les notes (étape 8).",
    after: [
      'Les effectifs par classe sont à jour.',
      'Les élèves sont prêts pour la facturation et l\'évaluation.',
    ],
  },
  {
    n: 7,
    icon: Coins,
    title: 'Configurer les frais et encaisser les paiements',
    where: 'Finances & Paiements',
    route: '/finances',
    goal:
      "Définir la grille tarifaire (frais de scolarité, inscription, etc.) par année et éventuellement par classe, puis enregistrer les paiements des élèves.",
    mustDo: [
      "Onglet « Grille tarifaire » : créez les frais de l'année (libellé, montant, échéances).",
      "Onglet « Paiements » : enregistrez les versements d'un élève (l'élève doit être inscrit — étape 6).",
      "Onglet « Tableau de bord » : suivez les recettes et les impayés.",
    ],
    before:
      "Doit être fait APRÈS les inscriptions : un paiement concerne un élève inscrit et une année active.",
    after: [
      'Vous pouvez générer des reçus de paiement et suivre les soldes.',
    ],
  },
  {
    n: 8,
    icon: ClipboardList,
    title: 'Saisir les évaluations et les notes',
    where: 'Pédagogie & Notes',
    route: '/pedagogie',
    goal:
      "Créer les évaluations de la période en cours et saisir les notes des élèves, puis générer les bulletins.",
    mustDo: [
      "Onglet « Notes » : choisissez classe → matière → période, créez l'évaluation, puis saisissez les notes.",
      "Vérifiez les moyennes calculées automatiquement (selon les coefficients et types d'évaluation).",
      "Générez / imprimez les bulletins de notes (l'en-tête vient de l'étape 1).",
    ],
    before:
      "Doit être fait APRÈS les affectations de matières (étape 5) et les inscriptions (étape 6).",
    after: [
      'Bulletins et récapitulatifs de notes disponibles.',
    ],
  },
  {
    n: 9,
    icon: RefreshCw,
    title: 'Sécurité et synchronisation',
    where: 'Sécurité & Synchronisation',
    route: '/security',
    goal:
      "Garder vos données en sécurité : vérifier la licence / les appareils autorisés, définir un mot de passe, et s'assurer que la synchronisation cloud fonctionne.",
    mustDo: [
      "Sécurité : vérifiez l'état de la licence et des appareils, changez le mot de passe par défaut.",
      "Synchronisation : vérifiez que l'état est « synchronisé » (opérations en attente = 0).",
      "Travaillez hors-ligne sans souci : tout sera envoyé dès le retour du réseau.",
    ],
    before:
      "À faire tôt, puis à surveiller régulièrement tout au long de l'année.",
    after: [
      'Vos données sont sauvegardées dans le cloud et votre poste est sécurisé.',
    ],
  },
  {
    n: 10,
    icon: Archive,
    title: "Clôturer l'année et archiver",
    where: 'Archives',
    route: '/archives',
    goal:
      "En fin d'année, clôturer l'année en cours puis la consulter à tout moment. On prépare ensuite la nouvelle année.",
    mustDo: [
      "Une fois l'année terminée, clôturez-la (Paramètres → Années scolaires → « Clôturer »).",
      "Consultez les archives (classes, élèves, notes) de l'année clôturée.",
      "Créez ensuite la nouvelle année (retour à l'étape 2) pour le cycle suivant.",
    ],
    before:
      "À faire uniquement en toute fin d'année scolaire, après la dernière saisie de notes.",
    after: [
      'Les données de l\'année restent consultables mais ne sont plus modifiables.',
    ],
  },
];

export default function PriseEnMain() {
  const navigate = useNavigate();

  return (
    <div className="px-8 py-7 w-full h-full overflow-y-auto bg-[#f8f9fc]">
      {/* En-tête */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[#4f46e5] uppercase tracking-wider mb-2">
          <Rocket size={14} />
          Prise en main
        </div>
        <h1 className="text-2xl font-bold text-[#1e293b] tracking-tight">
          Bien démarrer avec Orion
        </h1>
        <p className="text-slate-500 mt-2 text-[14px] max-w-3xl leading-relaxed">
          Suivez ces étapes <strong>dans l'ordre</strong>. Chaque étape s'appuie sur la
          précédente : les éléments encadrés « Avant de continuer » indiquent ce qui doit
          impérativement exister <em>avant</em> de passer à la suite.
        </p>
      </div>

      {/* Bandeau conseil */}
      <div className="mb-8 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-5 py-4">
        <Lightbulb size={18} className="text-[#4f46e5] flex-shrink-0 mt-0.5" />
        <p className="text-[13px] text-slate-600 leading-relaxed">
          Règle générale de l'ordre des opérations :
          <span className="font-semibold text-slate-700">
            {' '}Identité → Année → Personnel → Classes → Matières → Élèves → Finances → Notes → Archives.
          </span>{' '}
          Si un bouton est grisé, c'est généralement qu'il manque une étape précédente
          (souvent l'année scolaire active).
        </p>
      </div>

      {/* Étapes */}
      <div className="relative">
        {/* Ligne verticale */}
        <div className="absolute left-[26px] top-3 bottom-3 w-px bg-gradient-to-b from-indigo-200 via-slate-200 to-slate-200 hidden md:block" />

        <ol className="space-y-5">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.n} className="relative md:pl-16">
                {/* Pastille numérotée */}
                <div className="hidden md:flex absolute left-0 top-5 w-[54px] h-[54px] items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-[0_4px_14px_-4px_rgba(79,70,229,0.25)]">
                  <span className="text-[19px] font-bold text-[#4f46e5]">{step.n}</span>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.04)] overflow-hidden">
                  {/* Entête de l'étape */}
                  <div className="px-6 pt-5 pb-4 border-b border-slate-50">
                    <div className="flex items-start gap-3">
                      <div className="md:hidden flex-shrink-0 w-8 h-8 rounded-xl bg-[#eef0ff] text-[#4f46e5] flex items-center justify-center text-[14px] font-bold">
                        {step.n}
                      </div>
                      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#eef0ff] text-[#4f46e5] flex items-center justify-center">
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[16px] font-bold text-slate-800 leading-snug">
                          {step.title}
                        </h2>
                        <p className="text-[12px] text-slate-400 mt-0.5 font-medium">{step.where}</p>
                      </div>
                      <button
                        onClick={() => navigate(step.route)}
                        className="hidden sm:flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold text-[#4f46e5] border border-[#4f46e5]/25 hover:bg-[#4f46e5] hover:text-white transition-all"
                      >
                        Ouvrir <ArrowRight size={13} />
                      </button>
                    </div>
                    <p className="text-[13px] text-slate-600 mt-3 leading-relaxed">{step.goal}</p>
                  </div>

                  {/* Corps */}
                  <div className="px-6 py-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <ListOrdered size={13} className="text-slate-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          À faire
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {step.mustDo.map((m, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] text-slate-600 leading-relaxed">
                            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#4f46e5] flex-shrink-0" />
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Avant de continuer */}
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
                      <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">
                          Avant de continuer
                        </p>
                        <p className="text-[12.5px] text-amber-800/90 leading-relaxed">{step.before}</p>
                      </div>
                    </div>

                    {/* Après cette étape */}
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                      <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">
                          Une fois terminé
                        </p>
                        <ul className="space-y-1">
                          {step.after.map((a, i) => (
                            <li key={i} className="text-[12.5px] text-emerald-800/90 leading-relaxed">
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(step.route)}
                      className="sm:hidden w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-[#4f46e5] border border-[#4f46e5]/25 hover:bg-[#4f46e5] hover:text-white transition-all"
                    >
                      Ouvrir « {step.where} » <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Pied */}
      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
        <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
        <p className="text-[13px] text-slate-600 leading-relaxed">
          Une fois ces étapes réalisées, votre établissement est pleinement opérationnel :
          vous pouvez inscrire des élèves, encaisser les frais, saisir les notes et imprimer
          les documents officiels. Revenez sur cette page à tout moment depuis le menu
          <span className="font-semibold text-slate-700"> « Prise en main »</span>.
        </p>
      </div>
    </div>
  );
}
