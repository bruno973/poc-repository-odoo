// adapters/mock/fixtures.ts
// Fixtures statiques : 3 employés (2 depts), tous les champs hydratés.
// Format intermédiaire "plat" — converti en formTree par hydrateMockSkeleton.
// Aucun terme Odoo.

import type { EmployeeSummary, DepartmentNode, OrgChartNode, Ref } from "../../domain/tree.js";

// ─── Format plat interne au mock (pré-hydratation) ────────────────────────────

export interface MockEmployeeFlat {
  id: number;
  header: {
    fullName: string;
    jobTitle: string | null;
    photo: string | null;
    department: Ref | null;
    jobPosition: Ref | null;
    manager: Ref | null;
    mentor: Ref | null;
    tags: Ref[];
    workEmail: string | null;
    workPhone: string | null;
    workMobile: string | null;
  };
  infoPro: {
    workAddress: Ref | null;
    workLocation: Ref | null;
    leaveManager: Ref | null;
    workSchedule: Ref | null;
    timezone: string | null;
  };
  infoPrivee: {
    privateStreet: string | null;
    privateCity: string | null;
    privateZip: string | null;
    privateCountry: Ref | null;
    privateEmail: string | null;
    privatePhone: string | null;
    kmHomeWork: number | null;
    privateCar: string | null;
    nationality: Ref | null;
    identNumber: string | null;
    ssnId: string | null;
    passportId: string | null;
    gender: "male" | "female" | "other" | null;
    birthday: string | null;
    birthPlace: string | null;
    countryBirth: Ref | null;
    emergencyContact: string | null;
    emergencyPhone: string | null;
    maritalStatus: "single" | "married" | "widower" | "divorced" | null;
    spouseName: string | null;
    spouseBirthdate: string | null;
    dependants: number | null;
    certificate: "graduate" | "bachelor" | "master" | "doctor" | "other" | null;
    studyField: string | null;
    studySchool: string | null;
    visaNo: string | null;
    permitNo: string | null;
    visaExpire: string | null;
    permitExpire: string | null;
  };
  parametres: {
    employeeType: "employee" | "student" | "freelance" | null;
    relatedUser: Ref | null;
    pinCode: string | null;
    badgeId: string | null;
  };
  orgChart: OrgChartNode;
}

// ─── Départements ──────────────────────────────────────────────────────────────

export const DEPARTMENTS: DepartmentNode[] = [
  { id: 1, name: "Direction", children: [], memberIds: [1, 2] },
  { id: 2, name: "Informatique", children: [], memberIds: [3] },
];

// ─── Résumés listing ──────────────────────────────────────────────────────────

export const SUMMARIES: EmployeeSummary[] = [
  {
    id: 1,
    fullName: "Abigail Peterson",
    jobTitle: "Directrice Générale",
    photo: null,
    department: { id: 1, label: "Direction" },
    workEmail: "abigail.peterson@example.com",
    workPhone: "(555) 233-3393",
  },
  {
    id: 2,
    fullName: "Bruno Martin",
    jobTitle: "Directeur des Ressources Humaines",
    photo: null,
    department: { id: 1, label: "Direction" },
    workEmail: "bruno.martin@example.com",
    workPhone: "(555) 100-2200",
  },
  {
    id: 3,
    fullName: "Camille Durand",
    jobTitle: "Développeuse Full-Stack",
    photo: null,
    department: { id: 2, label: "Informatique" },
    workEmail: "camille.durand@example.com",
    workPhone: "(555) 300-4400",
  },
];

// ─── Fiches complètes (format plat, hydraté en formTree par le repository) ───

export const RECORDS: MockEmployeeFlat[] = [
  {
    id: 1,
    header: {
      fullName: "Abigail Peterson",
      jobTitle: "Directrice Générale",
      photo: null,
      department: { id: 1, label: "Direction" },
      jobPosition: { id: 10, label: "Directeur Général" },
      manager: null,
      mentor: null,
      tags: [{ id: 1, label: "Cadre" }],
      workEmail: "abigail.peterson@example.com",
      workPhone: "(555) 233-3393",
      workMobile: "(555) 233-3394",
    },
    infoPro: {
      workAddress: { id: 5, label: "Siège Social — 1 Rue Principale, Cayenne" },
      workLocation: { id: 2, label: "Bureau" },
      leaveManager: { id: 2, label: "Bruno Martin" },
      workSchedule: { id: 1, label: "35h/semaine" },
      timezone: "America/Cayenne",
    },
    infoPrivee: {
      privateStreet: "12 Allée des Palmiers",
      privateCity: "Cayenne",
      privateZip: "97300",
      privateCountry: { id: 75, label: "France" },
      privateEmail: "abigail.private@personal.com",
      privatePhone: "(555) 900-1111",
      kmHomeWork: 8,
      privateCar: "AB-123-CD",
      nationality: { id: 75, label: "France" },
      identNumber: "97300012345678",
      ssnId: "2 90 05 97301 001 12",
      passportId: "FR9900001",
      gender: "female",
      birthday: "1980-05-14",
      birthPlace: "Cayenne",
      countryBirth: { id: 75, label: "France" },
      emergencyContact: "Marc Peterson",
      emergencyPhone: "(555) 900-9999",
      maritalStatus: "married",
      spouseName: "Marc Peterson",
      spouseBirthdate: "1978-11-03",
      dependants: 2,
      certificate: "master",
      studyField: "Management des organisations",
      studySchool: "IAE Paris",
      visaNo: null,
      permitNo: null,
      visaExpire: null,
      permitExpire: null,
    },
    parametres: {
      employeeType: "employee",
      relatedUser: { id: 3, label: "abigail.peterson@example.com" },
      pinCode: "1234",
      badgeId: "EMP001",
    },
    orgChart: {
      id: 1,
      fullName: "Abigail Peterson",
      jobTitle: "Directrice Générale",
      photo: null,
      children: [
        { id: 2, fullName: "Bruno Martin", jobTitle: "DRH", photo: null, children: [] },
      ],
    },
  },
  {
    id: 2,
    header: {
      fullName: "Bruno Martin",
      jobTitle: "Directeur des Ressources Humaines",
      photo: null,
      department: { id: 1, label: "Direction" },
      jobPosition: { id: 11, label: "DRH" },
      manager: { id: 1, label: "Abigail Peterson" },
      mentor: null,
      tags: [{ id: 1, label: "Cadre" }, { id: 2, label: "RH" }],
      workEmail: "bruno.martin@example.com",
      workPhone: "(555) 100-2200",
      workMobile: null,
    },
    infoPro: {
      workAddress: { id: 5, label: "Siège Social — 1 Rue Principale, Cayenne" },
      workLocation: { id: 2, label: "Bureau" },
      leaveManager: { id: 1, label: "Abigail Peterson" },
      workSchedule: { id: 1, label: "35h/semaine" },
      timezone: "America/Cayenne",
    },
    infoPrivee: {
      privateStreet: "5 Rue des Flamboyants",
      privateCity: "Rémire-Montjoly",
      privateZip: "97354",
      privateCountry: { id: 75, label: "France" },
      privateEmail: "bruno.martin@personal.fr",
      privatePhone: "(555) 200-3300",
      kmHomeWork: 15,
      privateCar: "GF-456-01",
      nationality: { id: 75, label: "France" },
      identNumber: "9735400234567",
      ssnId: "1 75 03 75056 001 34",
      passportId: null,
      gender: "male",
      birthday: "1975-03-28",
      birthPlace: "Paris",
      countryBirth: { id: 75, label: "France" },
      emergencyContact: "Sophie Martin",
      emergencyPhone: "(555) 200-8888",
      maritalStatus: "married",
      spouseName: "Sophie Martin",
      spouseBirthdate: "1977-07-15",
      dependants: 3,
      certificate: "master",
      studyField: "Droit social",
      studySchool: "Université Paris II",
      visaNo: null,
      permitNo: null,
      visaExpire: null,
      permitExpire: null,
    },
    parametres: {
      employeeType: "employee",
      relatedUser: { id: 4, label: "bruno.martin@example.com" },
      pinCode: "5678",
      badgeId: "EMP002",
    },
    orgChart: {
      id: 2,
      fullName: "Bruno Martin",
      jobTitle: "DRH",
      photo: null,
      children: [],
    },
  },
  {
    id: 3,
    header: {
      fullName: "Camille Durand",
      jobTitle: "Développeuse Full-Stack",
      photo: null,
      department: { id: 2, label: "Informatique" },
      jobPosition: { id: 20, label: "Développeuse" },
      manager: { id: 1, label: "Abigail Peterson" },
      mentor: { id: 2, label: "Bruno Martin" },
      tags: [{ id: 3, label: "Tech" }],
      workEmail: "camille.durand@example.com",
      workPhone: "(555) 300-4400",
      workMobile: "(555) 300-4401",
    },
    infoPro: {
      workAddress: { id: 5, label: "Siège Social — 1 Rue Principale, Cayenne" },
      workLocation: { id: 3, label: "Télétravail" },
      leaveManager: { id: 1, label: "Abigail Peterson" },
      workSchedule: { id: 2, label: "37h/semaine" },
      timezone: "America/Cayenne",
    },
    infoPrivee: {
      privateStreet: "8 Boulevard du Larivot",
      privateCity: "Matoury",
      privateZip: "97351",
      privateCountry: { id: 75, label: "France" },
      privateEmail: "camille.d@personal.fr",
      privatePhone: "(555) 400-5500",
      kmHomeWork: 22,
      privateCar: null,
      nationality: { id: 75, label: "France" },
      identNumber: "9735100345678",
      ssnId: "2 93 02 75013 001 55",
      passportId: "FR0099887",
      gender: "female",
      birthday: "1993-02-18",
      birthPlace: "Lyon",
      countryBirth: { id: 75, label: "France" },
      emergencyContact: "Élise Durand",
      emergencyPhone: "(555) 500-7777",
      maritalStatus: "single",
      spouseName: null,
      spouseBirthdate: null,
      dependants: 0,
      certificate: "master",
      studyField: "Informatique",
      studySchool: "Université Claude Bernard Lyon 1",
      visaNo: null,
      permitNo: null,
      visaExpire: null,
      permitExpire: null,
    },
    parametres: {
      employeeType: "employee",
      relatedUser: { id: 5, label: "camille.durand@example.com" },
      pinCode: "9012",
      badgeId: "EMP003",
    },
    orgChart: {
      id: 3,
      fullName: "Camille Durand",
      jobTitle: "Développeuse Full-Stack",
      photo: null,
      children: [],
    },
  },
];
