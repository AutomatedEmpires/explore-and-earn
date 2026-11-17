// Default fit weights (spec 8.3). Changing them changes FIT_WEIGHTS_VERSION.
import { createHash } from 'node:crypto';
import type { FitWeights } from '@/lib/hiring';

export const FIT_WEIGHTS: FitWeights = {
  maritime: {
    occupation: 20,
    availability: 20,
    skills: 15,
    certifications: 20,
    work_authorization: 10,
    pay: 5,
    location: 10,
  },
  seasonal: {
    occupation: 20,
    availability: 30,
    skills: 15,
    certifications: 5,
    work_authorization: 10,
    pay: 10,
    location: 10,
  },
  farm: {
    occupation: 20,
    availability: 30,
    skills: 20,
    certifications: 5,
    work_authorization: 10,
    pay: 5,
    location: 10,
  },
  remote: {
    occupation: 25,
    availability: 15,
    skills: 25,
    certifications: 5,
    work_authorization: 10,
    pay: 10,
    location: 10,
  },
};

const hash = createHash('sha256');
hash['update'](JSON.stringify(FIT_WEIGHTS));
export const FIT_WEIGHTS_VERSION = 'fit_weights@' + hash.digest('hex').slice(0, 8);
