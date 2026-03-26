/**
 * Minimal FHIR-aligned types for read-only integration scaffolding.
 * Expand in later phases; keep strict and PHI-free in logs.
 */

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirPatientSummary {
  id: string;
  gender?: string;
  birthDate?: string;
}
