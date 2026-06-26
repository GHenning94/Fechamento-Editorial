export interface LicensePayload {
  id: string;
}

export interface StoredLicense {
  serial: string;
  licenseId: string;
  machineId: string;
  activatedAt: string;
}

export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseError";
  }
}
