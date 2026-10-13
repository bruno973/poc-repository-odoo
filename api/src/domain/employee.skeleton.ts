// domain/employee.skeleton.ts
// Squelette statique de la fiche employé — structure + visibilité, AUCUNE valeur.
// Déclaratif pur : aucun terme Odoo, aucun appel réseau.
// `editable: false` par défaut ici — surchargé à l'hydratation par l'adapter
// (api/src/adapters/odoo18/mapping.ts) selon les droits réels du viewer.

import type { GroupNode, VisibleIf } from "./tree.js";

const ALWAYS: VisibleIf = { kind: "always" };

const SELF_OR_ADMIN: VisibleIf = {
  kind: "or",
  conditions: [{ kind: "self" }, { kind: "role", roles: ["hr_admin"] }],
};

const SELF_OR_MANAGER_PLUS: VisibleIf = {
  kind: "or",
  conditions: [
    { kind: "self" },
    { kind: "role", roles: ["manager", "hr_admin"] },
  ],
};

const HR_ADMIN_ONLY: VisibleIf = { kind: "role", roles: ["hr_admin"] };

// Avant : seule la condition sur l'état civil → nom et date de naissance du
// conjoint visibles par n'importe quel viewer. Il faut AUSSI être soi-même ou admin.
const HAS_SPOUSE: VisibleIf = {
  kind: "and",
  conditions: [
    SELF_OR_ADMIN,
    { kind: "field", field: "infoPrivee.maritalStatus", operator: "neq", value: "single" },
  ],
};

export const EMPLOYEE_SKELETON: GroupNode[] = [
  {
    kind: "group",
    key: "header",
    label: "Informations générales",
    visibleIf: ALWAYS,
    children: [
      { kind: "text",     key: "header.fullName",    label: "Nom complet",       value: null, visibleIf: ALWAYS, editable: false },
      { kind: "text",     key: "header.jobTitle",    label: "Poste",             value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "header.department",   label: "Département",       value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "header.jobPosition",  label: "Fonction",          value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "header.manager",      label: "Manager",           value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "header.mentor",       label: "Mentor",            value: null, visibleIf: ALWAYS, editable: false },
      { kind: "text",     key: "header.workEmail",   label: "Email pro",         value: null, visibleIf: ALWAYS, editable: false },
      { kind: "text",     key: "header.workPhone",   label: "Téléphone pro",     value: null, visibleIf: ALWAYS, editable: false },
      { kind: "text",     key: "header.workMobile",  label: "Mobile pro",        value: null, visibleIf: ALWAYS, editable: false },
    ],
  },
  {
    kind: "group",
    key: "infoPro",
    label: "Informations professionnelles",
    visibleIf: ALWAYS,
    children: [
      { kind: "many2one", key: "infoPro.workAddress",  label: "Adresse de travail",  value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "infoPro.workLocation", label: "Lieu de travail",     value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "infoPro.leaveManager", label: "Responsable congés",  value: null, visibleIf: ALWAYS, editable: false },
      { kind: "many2one", key: "infoPro.workSchedule", label: "Planning de travail", value: null, visibleIf: ALWAYS, editable: false },
      { kind: "text",     key: "infoPro.timezone",     label: "Fuseau horaire",      value: null, visibleIf: ALWAYS, editable: false },
    ],
  },
  {
    kind: "group",
    key: "infoPrivee",
    label: "Informations privées",
    visibleIf: SELF_OR_ADMIN,
    children: [
      {
        kind: "group",
        key: "infoPrivee.adresse",
        label: "Adresse personnelle",
        visibleIf: SELF_OR_ADMIN,
        children: [
          { kind: "text",     key: "infoPrivee.privateStreet",   label: "Rue",          value: null, visibleIf: SELF_OR_ADMIN, editable: false },
          { kind: "text",     key: "infoPrivee.privateCity",     label: "Ville",        value: null, visibleIf: SELF_OR_ADMIN, editable: false },
          { kind: "text",     key: "infoPrivee.privateZip",      label: "Code postal",  value: null, visibleIf: SELF_OR_ADMIN, editable: false },
          { kind: "many2one", key: "infoPrivee.privateCountry",  label: "Pays",         value: null, visibleIf: SELF_OR_ADMIN, editable: false },
        ],
      },
      { kind: "text",     key: "infoPrivee.privateEmail",      label: "Email privé",            value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.privatePhone",      label: "Tél. privé",             value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.kmHomeWork",        label: "Km domicile-travail",    value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.privateCar",        label: "Immatriculation",        value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.emergencyContact",  label: "Contact urgence",        value: null, visibleIf: SELF_OR_MANAGER_PLUS, editable: false },
      { kind: "text",     key: "infoPrivee.emergencyPhone",    label: "Tél. urgence",           value: null, visibleIf: SELF_OR_MANAGER_PLUS, editable: false },
      { kind: "many2one", key: "infoPrivee.nationality",       label: "Nationalité",            value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.identNumber",       label: "N° pièce d'identité",    value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.ssnId",             label: "N° sécurité sociale",    value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text",     key: "infoPrivee.passportId",        label: "N° passeport",           value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      {
        kind: "select",
        key: "infoPrivee.gender",
        label: "Genre",
        value: null,
        visibleIf: SELF_OR_ADMIN,
        editable: false,
        options: [
          { value: "male",   label: "Masculin" },
          { value: "female", label: "Féminin" },
          { value: "other",  label: "Autre" },
        ],
      },
      { kind: "text", key: "infoPrivee.birthday",    label: "Date de naissance",  value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "text", key: "infoPrivee.birthPlace",  label: "Lieu de naissance",  value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      { kind: "many2one", key: "infoPrivee.countryBirth", label: "Pays de naissance", value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      {
        kind: "select",
        key: "infoPrivee.maritalStatus",
        label: "État civil",
        value: null,
        visibleIf: SELF_OR_ADMIN,
        editable: false,
        options: [
          { value: "single",   label: "Célibataire" },
          { value: "married",  label: "Marié(e)" },
          { value: "widower",  label: "Veuf/veuve" },
          { value: "divorced", label: "Divorcé(e)" },
        ],
      },
      { kind: "text", key: "infoPrivee.spouseName",      label: "Nom du conjoint",      value: null, visibleIf: HAS_SPOUSE, editable: false },
      { kind: "text", key: "infoPrivee.spouseBirthdate", label: "Date nais. conjoint",  value: null, visibleIf: HAS_SPOUSE, editable: false },
      { kind: "text", key: "infoPrivee.dependants",      label: "Personnes à charge",   value: null, visibleIf: SELF_OR_ADMIN, editable: false },
      {
        kind: "group",
        key: "infoPrivee.education",
        label: "Formation",
        visibleIf: SELF_OR_ADMIN,
        children: [
          {
            kind: "select",
            key: "infoPrivee.certificate",
            label: "Niveau d'études",
            value: null,
            visibleIf: SELF_OR_ADMIN,
            editable: false,
            options: [
              { value: "graduate", label: "Diplômé" },
              { value: "bachelor", label: "Licence" },
              { value: "master",   label: "Master" },
              { value: "doctor",   label: "Doctorat" },
              { value: "other",    label: "Autre" },
            ],
          },
          { kind: "text", key: "infoPrivee.studyField",  label: "Domaine d'études", value: null, visibleIf: SELF_OR_ADMIN, editable: false },
          { kind: "text", key: "infoPrivee.studySchool", label: "École/Université", value: null, visibleIf: SELF_OR_ADMIN, editable: false },
        ],
      },
      {
        kind: "group",
        key: "infoPrivee.visaPermis",
        label: "Visa & permis de travail",
        visibleIf: HR_ADMIN_ONLY,
        children: [
          { kind: "text", key: "infoPrivee.visaNo",       label: "N° visa",          value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
          { kind: "text", key: "infoPrivee.permitNo",     label: "N° permis",        value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
          { kind: "text", key: "infoPrivee.visaExpire",   label: "Expiration visa",  value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
          { kind: "text", key: "infoPrivee.permitExpire", label: "Expiration permis",value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
        ],
      },
    ],
  },
  {
    kind: "group",
    key: "parametres",
    label: "Paramètres",
    visibleIf: HR_ADMIN_ONLY,
    children: [
      {
        kind: "select",
        key: "parametres.employeeType",
        label: "Type d'employé",
        value: null,
        visibleIf: HR_ADMIN_ONLY,
        editable: false,
        options: [
          { value: "employee",  label: "Employé" },
          { value: "student",   label: "Étudiant" },
          { value: "freelance", label: "Indépendant" },
        ],
      },
      { kind: "many2one", key: "parametres.relatedUser", label: "Utilisateur associé", value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
      { kind: "text",     key: "parametres.pinCode",     label: "PIN",                 value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
      { kind: "text",     key: "parametres.badgeId",     label: "Badge ID",            value: null, visibleIf: HR_ADMIN_ONLY, editable: false },
    ],
  },
];
