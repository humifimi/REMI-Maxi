import {
  captureBookingForConfirmation,
  consumeBookingConfirmation,
  hintFromObservation,
  useBookingStore,
} from '@/src/stores/customer/booking';
import type {
  Address,
  CreateBookingResponse,
  DeferredWorkItem,
  ScoredSuggestion,
  Service,
  Vehicle,
} from '@customer/types/api';

const oilChange: Service = {
  id: 1,
  name: 'Oil Change',
  description: null,
  base_price: 89,
  duration_minutes: 30,
  is_active: true,
  category: 'maintenance',
  health_component: 'oil',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const tireRotation: Service = { ...oilChange, id: 2, name: 'Tire Rotation', health_component: 'tires' };

const vehicle = {
  id: 7,
  year: 2020,
  make: 'Honda',
  model: 'Civic',
  nickname: null,
} as Vehicle;

const address = {
  id: 11,
  user_id: 1,
  address_line: '123 Main St',
  city: 'SLC',
  state: 'UT',
  zip: '84101',
  address_type: 'home',
  lat: null,
  lng: null,
  is_default: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} as Address;

const suggestion = {
  technicianId: 5,
  technicianName: 'Sam',
  date: '2026-04-15',
  timeSlot: '14:00',
  insertionPosition: 0,
  score: 0.9,
  breakdown: {} as never,
  explanation: 'great fit',
  estimatedDriveMinutes: 10,
} as ScoredSuggestion;

const deferredItem = { id: 99, appointment_id: 50, vehicle_id: 7 } as DeferredWorkItem;

const fullySetState = {
  selectedServices: [oilChange],
  selectedVehicle: vehicle,
  selectedDate: '2026-04-15',
  selectedTime: '14:00',
  selectedAddress: address,
  selectedSuggestion: suggestion,
  deferredItemId: 1,
  prefilled: true,
  suggestedComponent: 'oil',
  suggestedComponents: ['oil'],
  selectedPaymentMethodId: 'pm_test',
};

beforeEach(() => {
  useBookingStore.getState().reset();
  // reset() doesn't touch the module-level confirmation snapshot.
  consumeBookingConfirmation();
});

describe('hintFromObservation', () => {
  it.each([
    ['Front brake pads worn', 'brakes'],
    ['cabin filter dirty', 'filter'],
    ['Low tire pressure', 'tires'],
    ['tread is gone', 'tires'],
    ['Wiper blade torn', 'wipers'],
    ['Coolant low', 'fluids'],
    ['Transmission fluid', 'fluids'],
    ['Oil leak', 'oil'],
    ['Some unrelated note', 'oil'],
    ['', 'oil'],
    [undefined, 'oil'],
  ])('hintFromObservation(%j) -> "%s"', (input, expected) => {
    expect(hintFromObservation(input as string | undefined)).toBe(expected);
  });
});

describe('useBookingStore', () => {
  describe('toggleService', () => {
    it('adds a service the first time and removes it the second time', () => {
      useBookingStore.getState().toggleService(oilChange);
      expect(useBookingStore.getState().selectedServices).toEqual([oilChange]);

      useBookingStore.getState().toggleService(tireRotation);
      expect(useBookingStore.getState().selectedServices).toEqual([oilChange, tireRotation]);

      useBookingStore.getState().toggleService(oilChange);
      expect(useBookingStore.getState().selectedServices).toEqual([tireRotation]);
    });
  });

  describe('simple setters', () => {
    it('setVehicle / setAddress / setDateTime / setPaymentMethodId update only their slice', () => {
      const s = useBookingStore.getState();
      s.setVehicle(vehicle);
      s.setAddress(address);
      s.setDateTime('2026-05-01', '09:00');
      s.setPaymentMethodId('pm_xyz');

      const next = useBookingStore.getState();
      expect(next.selectedVehicle).toBe(vehicle);
      expect(next.selectedAddress).toBe(address);
      expect(next.selectedDate).toBe('2026-05-01');
      expect(next.selectedTime).toBe('09:00');
      expect(next.selectedPaymentMethodId).toBe('pm_xyz');
      // Other fields untouched.
      expect(next.selectedServices).toEqual([]);
    });

    it('setSelectedSuggestion mirrors date/time onto the booking', () => {
      useBookingStore.getState().setSelectedSuggestion(suggestion);
      const s = useBookingStore.getState();
      expect(s.selectedSuggestion).toBe(suggestion);
      expect(s.selectedDate).toBe(suggestion.date);
      expect(s.selectedTime).toBe(suggestion.timeSlot);
    });
  });

  describe('reset', () => {
    it('clears every selection and prefilled flags', () => {
      useBookingStore.setState(fullySetState);
      useBookingStore.getState().reset();

      const s = useBookingStore.getState();
      expect(s.selectedServices).toEqual([]);
      expect(s.selectedVehicle).toBeNull();
      expect(s.selectedDate).toBeNull();
      expect(s.selectedTime).toBeNull();
      expect(s.selectedAddress).toBeNull();
      expect(s.selectedSuggestion).toBeNull();
      expect(s.deferredItemId).toBeNull();
      expect(s.prefilled).toBe(false);
      expect(s.suggestedComponent).toBeNull();
      expect(s.suggestedComponents).toEqual([]);
      expect(s.selectedPaymentMethodId).toBeNull();
    });
  });

  describe('entry-point actions', () => {
    it('startFreshBooking resets state and routes to select-service', () => {
      useBookingStore.setState(fullySetState);

      const route = useBookingStore.getState().startFreshBooking();

      expect(route).toBe('/customer/booking/select-service');
      expect(useBookingStore.getState().selectedServices).toEqual([]);
      expect(useBookingStore.getState().selectedVehicle).toBeNull();
    });

    it('startWithComponent seeds a suggested component and optional vehicle', () => {
      const route = useBookingStore.getState().startWithComponent('brakes', vehicle);

      expect(route).toBe('/customer/booking/select-service');
      const s = useBookingStore.getState();
      expect(s.suggestedComponent).toBe('brakes');
      expect(s.suggestedComponents).toEqual(['brakes']);
      expect(s.selectedVehicle).toBe(vehicle);
    });

    it('startWithComponents stores the full list and uses the first as the primary hint', () => {
      const route = useBookingStore.getState().startWithComponents(['oil', 'filter'], vehicle);

      expect(route).toBe('/customer/booking/select-service');
      const s = useBookingStore.getState();
      expect(s.suggestedComponent).toBe('oil');
      expect(s.suggestedComponents).toEqual(['oil', 'filter']);
    });

    it('startFromDeferred jumps straight to address with a preselected service', () => {
      const route = useBookingStore.getState().startFromDeferred(deferredItem, vehicle, oilChange);

      expect(route).toBe('/customer/booking/select-address');
      const s = useBookingStore.getState();
      expect(s.selectedServices).toEqual([oilChange]);
      expect(s.selectedVehicle).toBe(vehicle);
      expect(s.deferredItemId).toBe(99);
      expect(s.prefilled).toBe(true);
    });

    it('startFromDeferredFallback maps observation text to a component hint', () => {
      const route = useBookingStore.getState().startFromDeferredFallback('worn brake pad', vehicle);

      expect(route).toBe('/customer/booking/select-service');
      expect(useBookingStore.getState().suggestedComponent).toBe('brakes');
    });

    it('startWithPreselectedServices clones the array (so callers can mutate theirs)', () => {
      const services = [oilChange, tireRotation];
      const route = useBookingStore.getState().startWithPreselectedServices(services, vehicle);

      services.pop();

      expect(route).toBe('/customer/booking/select-address');
      expect(useBookingStore.getState().selectedServices).toEqual([oilChange, tireRotation]);
    });
  });

  describe('prefillFromDeferred', () => {
    it('replaces state with the deferred item context', () => {
      useBookingStore.setState({ selectedDate: '2026-04-15', selectedTime: '14:00' });

      useBookingStore.getState().prefillFromDeferred(deferredItem, vehicle, oilChange);

      const s = useBookingStore.getState();
      expect(s.selectedServices).toEqual([oilChange]);
      expect(s.selectedVehicle).toBe(vehicle);
      expect(s.deferredItemId).toBe(99);
      expect(s.prefilled).toBe(true);
      expect(s.selectedDate).toBeNull();
      expect(s.selectedTime).toBeNull();
    });
  });
});

describe('booking confirmation snapshot', () => {
  const serverResponse: CreateBookingResponse = {
    appointmentId: 1234,
    technicianName: 'Sam',
    scheduledDate: '2026-04-15',
    scheduledTime: '14:00',
    status: 'confirmed',
  };

  it('captures the current state and returns it once', () => {
    useBookingStore.setState(fullySetState);

    captureBookingForConfirmation(serverResponse);
    const first = consumeBookingConfirmation();

    expect(first).not.toBeNull();
    expect(first!.serverResponse).toEqual(serverResponse);
    expect(first!.selectedServices).toEqual([oilChange]);
    expect(first!.selectedVehicle).toBe(vehicle);

    expect(consumeBookingConfirmation()).toBeNull();
  });

  it('is independent of the live store (mutations do not affect snapshot)', () => {
    useBookingStore.setState(fullySetState);
    captureBookingForConfirmation();

    useBookingStore.getState().reset();

    const snap = consumeBookingConfirmation();
    expect(snap?.selectedServices).toEqual([oilChange]);
    expect(snap?.suggestedComponents).toEqual(['oil']);
  });

  it('captures null serverResponse when none is provided', () => {
    captureBookingForConfirmation();
    expect(consumeBookingConfirmation()?.serverResponse).toBeNull();
  });
});
