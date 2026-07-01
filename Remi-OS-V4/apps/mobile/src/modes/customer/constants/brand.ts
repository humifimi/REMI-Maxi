/**
 * Centralized brand configuration for white-label readiness.
 *
 * REMI = the software platform (internal name, repo/package identifiers).
 * MAXI = the customer-facing brand (what users see in the app).
 *
 * All customer-facing brand strings and overridable theming values
 * should be referenced from here. A future franchise or white-label
 * setup can swap this file to rebrand the entire app.
 */
export const Brand = {
  appName: 'MAXI',
  tagline: 'Your vehicle health companion',

  serviceCopy: {
    bookAction: 'Book a Service',
    welcomeSubtitle:
      'Book a service, track your vehicle health, and manage your garage — all from your phone.',
    serviceComplete: 'Service is complete. Ready when you are.',
    thankYou: 'Thanks for choosing MAXI!',
  },

  permissions: {
    camera: 'MAXI needs camera access to scan license plates and VIN barcodes.',
    cameraShort: 'MAXI needs camera access to scan your license plate.',
  },
} as const;
