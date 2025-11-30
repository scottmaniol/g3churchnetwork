import React, { useState } from 'react';
import { Button } from './Button';
import { ChurchApplication, ApplicationStatus, ChurchLeader, ChurchGathering } from '../types';
import { ArrowLeft, Plus, Trash2, CreditCard, Mail } from 'lucide-react';
import { loadStripe, StripeCardElement } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '../services/stripe';
import { createStripeSetupIntent, verifyPromoCode } from '../services/firebase';
import { ContactAdminModal } from './ContactAdminModal';

interface ApplicationFormProps {
  onSubmit: (app: Omit<ChurchApplication, 'id'>, password: string) => void;
  onCancel: () => void;
}

// Initial state constant
const INITIAL_STATE = {
  applicantFirstName: '',
  applicantLastName: '',
  applicantEmail: '',
  password: '',
  confirmPassword: '',
  churchName: '',
  churchAddress: {
    country: '',
    street: '',
    aptUnit: '',
    city: '',
    state: '',
    postalCode: '',
  },
  churchPhone: '',
  churchEmail: '',
  churchDescription: '',
  leaders: [] as ChurchLeader[],
  gatherings: [] as ChurchGathering[],
  connections: {
    website: '',
  },
  pluralityOfElders: '' as const,
  churchDiscipline: '' as const,
  ssjgSigned: '' as const,
  confessionAffirmation: '',
  
  // Payment
  paymentAmount: 500,
  paymentFrequency: 'yearly' as 'yearly' | 'one_time',

  // Promo Code
  promoCode: '',
};

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: "#32325d",
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: "antialiased",
      fontSize: "16px",
      "::placeholder": {
        color: "#aab7c4",
      },
    },
    invalid: {
      color: "#fa755a",
      iconColor: "#fa755a",
    },
  },
};

const ApplicationFormContent: React.FC<ApplicationFormProps> = ({ onSubmit, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(INITIAL_STATE);
  const [passwordError, setPasswordError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentReady, setPaymentReady] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [showPromoField, setShowPromoField] = useState(false);
  const [promoCodeMessage, setPromoCodeMessage] = useState('');
  const [isPromoCodeValid, setIsPromoCodeValid] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);


  React.useEffect(() => {
    if (stripe) {
      setPaymentReady(true);
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('promo') === 'true') {
      setShowPromoField(true);
    }
  }, [stripe]);

  const handlePromoCodeCheck = async () => {
    if (!promoCode) {
      setPromoCodeMessage('Please enter a promo code.');
      return;
    }
    try {
      const isValid = await verifyPromoCode(promoCode);
      if (isValid) {
        setPromoCodeMessage('Promo code applied successfully!');
        setIsPromoCodeValid(true);
        // Optionally, reset payment fields
        setFormData(prev => ({ ...prev, paymentAmount: 0 }));
      } else {
        setPromoCodeMessage('Invalid or expired promo code.');
        setIsPromoCodeValid(false);
      }
    } catch (error) {
      setPromoCodeMessage('Error verifying promo code.');
      setIsPromoCodeValid(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPaymentError('');

    // Validate passwords
    if (formData.password !== formData.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    // Validate Payment (only if no valid promo code)
    if (!isPromoCodeValid && formData.paymentAmount < 500) {
      setPaymentError('Minimum dues amount is $500.');
      return;
    }

    if (!isPromoCodeValid) {
      if (!stripe || !elements) {
        setPaymentError('Payment system not initialized. Please try again.');
        return;
      }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;
    }

    setIsSubmitting(true);
    
    try {
      let customerId = '';
      let paymentMethodId = '';

      if (!isPromoCodeValid) {
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
            setPaymentError('Card details are not correct. Please try again.');
            return;
        }
        // 1. Create Setup Intent to get Client Secret
        const setupIntentResult = await createStripeSetupIntent(
          formData.applicantEmail, 
          `${formData.applicantFirstName} ${formData.applicantLastName}`
        );
        customerId = setupIntentResult.customerId;
        const clientSecret = setupIntentResult.clientSecret;

        // 2. Confirm Card Setup
        const result = await stripe!.confirmCardSetup(clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: {
              name: `${formData.applicantFirstName} ${formData.applicantLastName}`,
              email: formData.applicantEmail,
              phone: formData.churchPhone,
            },
          },
        });

        if (result.error) {
          setPaymentError(result.error.message || 'Payment setup failed.');
          setIsSubmitting(false);
          return;
        }

        if (!result.setupIntent || result.setupIntent.status !== 'succeeded') {
          setPaymentError('Payment setup failed. Please check your card details.');
          setIsSubmitting(false);
          return;
        }

        paymentMethodId = result.setupIntent.payment_method as string;
      }

      // 3. Prepare Application Data
      const { password, confirmPassword, ...applicationData } = formData;
      
      const newApplication: Omit<ChurchApplication, 'id' | 'coordinates' | 'userId'> = {
        ...applicationData,
        stripeCustomerId: customerId,
        stripePaymentMethodId: paymentMethodId,
        promoCodeUsed: isPromoCodeValid ? promoCode : '',
        status: ApplicationStatus.PENDING,
        submittedAt: new Date().toISOString(),
      };
      
      // 4. Submit
      await onSubmit(newApplication, password);

    } catch (error: any) {
      console.error("Form submission error:", error);
      setPaymentError(error.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name.startsWith('churchAddress.')) {
      const field = name.split('.')[1] as keyof typeof formData.churchAddress;
      setFormData(prev => ({
        ...prev,
        churchAddress: { ...prev.churchAddress, [field]: value }
      }));
    } else if (name.startsWith('connections.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        connections: { ...prev.connections, [field]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const addLeader = () => {
    const newLeader: ChurchLeader = {
      id: `temp_${Date.now()}`,
      firstName: '',
      lastName: '',
      role: 'Elder',
      email: '',
      phone: ''
    };
    setFormData(prev => ({
      ...prev,
      leaders: [...prev.leaders, newLeader]
    }));
  };

  const removeLeader = (id: string) => {
    setFormData(prev => ({
      ...prev,
      leaders: prev.leaders.filter(l => l.id !== id)
    }));
  };

  const updateLeader = (id: string, field: keyof ChurchLeader, value: string) => {
    setFormData(prev => ({
      ...prev,
      leaders: prev.leaders.map(l => l.id === id ? { ...l, [field]: value } : l)
    }));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button 
        onClick={onCancel}
        type="button"
        className="mb-6 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Home
      </button>

      <div className="bg-white shadow-xl rounded-2xl overflow-hidden">
        <div className="bg-black px-8 py-6">
          <h2 className="text-3xl font-serif font-bold text-white">Join the G3 Network</h2>
          <p className="text-gray-300 mt-2">Submit your application and create your church account</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-10">
          
          {/* Account Setup */}
          <fieldset className="space-y-6">
            <legend className="text-xl font-serif font-semibold text-gray-900 border-b pb-2 w-full">Account Setup</legend>
            <p className="text-sm text-gray-600">Create an account to manage your church profile after submission</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="applicantFirstName" className="block text-sm font-medium text-gray-700">First Name *</label>
                <input type="text" name="applicantFirstName" id="applicantFirstName" required onChange={handleChange} value={formData.applicantFirstName} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
              <div>
                <label htmlFor="applicantLastName" className="block text-sm font-medium text-gray-700">Last Name *</label>
                <input type="text" name="applicantLastName" id="applicantLastName" required onChange={handleChange} value={formData.applicantLastName} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
            </div>
            
            <div>
              <label htmlFor="applicantEmail" className="block text-sm font-medium text-gray-700">Email Address * (Your login email)</label>
              <input type="email" name="applicantEmail" id="applicantEmail" placeholder="name@example.com" required onChange={handleChange} value={formData.applicantEmail} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password * (Min. 6 characters)</label>
                <input type="password" name="password" id="password" required onChange={handleChange} value={formData.password} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm Password *</label>
                <input type="password" name="confirmPassword" id="confirmPassword" required onChange={handleChange} value={formData.confirmPassword} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
            </div>
            
            {passwordError && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{passwordError}</div>
            )}
          </fieldset>
          
          {/* Church Information */}
          <fieldset className="space-y-6">
            <legend className="text-xl font-serif font-semibold text-gray-900 border-b pb-2 w-full">Church Information</legend>
            
            <div>
              <label htmlFor="churchName" className="block text-sm font-medium text-gray-700">Church Name *</label>
              <input type="text" name="churchName" id="churchName" required onChange={handleChange} value={formData.churchName} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">Address *</label>
              <input type="text" name="churchAddress.street" placeholder="Street Address" required onChange={handleChange} value={formData.churchAddress.street} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              <input type="text" name="churchAddress.aptUnit" placeholder="Apt/unit/box (optional)" onChange={handleChange} value={formData.churchAddress.aptUnit} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" name="churchAddress.city" placeholder="City" required onChange={handleChange} value={formData.churchAddress.city} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
                <input type="text" name="churchAddress.state" placeholder="State / Province" required onChange={handleChange} value={formData.churchAddress.state} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" name="churchAddress.postalCode" placeholder="Postal Code" required onChange={handleChange} value={formData.churchAddress.postalCode} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
                <input type="text" name="churchAddress.country" placeholder="Country" required onChange={handleChange} value={formData.churchAddress.country} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="churchPhone" className="block text-sm font-medium text-gray-700">Phone Number *</label>
                <input type="tel" name="churchPhone" id="churchPhone" required onChange={handleChange} value={formData.churchPhone} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="connections.website" className="block text-sm font-medium text-gray-700">Church Website</label>
                <input type="url" name="connections.website" id="connections.website" placeholder="https://" onChange={handleChange} value={formData.connections.website} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
              <div>
                <label htmlFor="churchEmail" className="block text-sm font-medium text-gray-700">Church Public Email</label>
                <input type="email" name="churchEmail" id="churchEmail" onChange={handleChange} value={formData.churchEmail} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
              </div>
            </div>

            <div>
              <label htmlFor="churchDescription" className="block text-sm font-medium text-gray-700">Briefly describe your church *</label>
              <textarea name="churchDescription" id="churchDescription" rows={4} required onChange={handleChange} value={formData.churchDescription} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
            </div>
          </fieldset>

          {/* Elders (Optional) */}
          <fieldset className="space-y-6">
            <legend className="text-xl font-serif font-semibold text-gray-900 border-b pb-2 w-full">Elders (Optional - can add later)</legend>
            
            {formData.leaders.map((leader) => (
              <div key={leader.id} className="border border-gray-200 rounded-lg p-4 relative">
                <button
                  type="button"
                  onClick={() => removeLeader(leader.id)}
                  className="absolute top-4 right-4 text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <input
                    type="text"
                    placeholder="First Name"
                    value={leader.firstName}
                    onChange={(e) => updateLeader(leader.id, 'firstName', e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                  />
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={leader.lastName}
                    onChange={(e) => updateLeader(leader.id, 'lastName', e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="email"
                    placeholder="Email"
                    value={leader.email}
                    onChange={(e) => updateLeader(leader.id, 'email', e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={leader.phone}
                    onChange={(e) => updateLeader(leader.id, 'phone', e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2"
                  />
                </div>
              </div>
            ))}
            
            <Button type="button" variant="outline" onClick={addLeader} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Leader
            </Button>
          </fieldset>

          {/* Doctrine & Practice */}
          <fieldset className="space-y-6">
            <legend className="text-xl font-serif font-semibold text-gray-900 border-b pb-2 w-full">Doctrine & Practice</legend>
            
            <div>
              <label htmlFor="pluralityOfElders" className="block text-sm font-medium text-gray-700">Is Your Local Church Led By a Plurality of Elders? *</label>
              <select name="pluralityOfElders" id="pluralityOfElders" required onChange={handleChange} value={formData.pluralityOfElders} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black">
                <option value="" disabled>Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="No, but working toward it.">No, but working toward it.</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="churchDiscipline" className="block text-sm font-medium text-gray-700">Does Your Local Church Practice Church Discipline? *</label>
              <select name="churchDiscipline" id="churchDiscipline" required onChange={handleChange} value={formData.churchDiscipline} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black">
                <option value="" disabled>Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="No, but working toward it.">No, but working toward it.</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="ssjgSigned" className="block text-sm font-medium text-gray-700">Has your church leadership signed the Statement on Social Justice and the Gospel? *</label>
              <select name="ssjgSigned" id="ssjgSigned" required onChange={handleChange} value={formData.ssjgSigned} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black">
                <option value="" disabled>Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="No, but agree with it">No, but agree with it</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="confessionAffirmation" className="block text-sm font-medium text-gray-700">Can you as the pastor(s) affirm the 1689 London Baptist Confession of Faith? If not, please explain. *</label>
              <textarea name="confessionAffirmation" id="confessionAffirmation" rows={5} required onChange={handleChange} value={formData.confessionAffirmation} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
            </div>
          </fieldset>

          {/* Network Dues */}
          {!isPromoCodeValid && (
          <fieldset className="space-y-6">
            <legend className="text-xl font-serif font-semibold text-gray-900 border-b pb-2 w-full flex items-center">
              <CreditCard className="w-5 h-5 mr-2" />
              Network Dues
            </legend>

            {showPromoField && (
              <div className="p-4 border border-gray-300 rounded-md bg-white">
                <label htmlFor="promoCode" className="block text-sm font-medium text-gray-700">Promo Code</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="text"
                    name="promoCode"
                    id="promoCode"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="flex-1 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300 p-2 border"
                    placeholder="Enter code"
                  />
                  <button
                    type="button"
                    onClick={handlePromoCodeCheck}
                    className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Apply
                  </button>
                </div>
                {promoCodeMessage && (
                  <p className={`mt-2 text-sm ${isPromoCodeValid ? 'text-green-600' : 'text-red-600'}`}>
                    {promoCodeMessage}
                  </p>
                )}
              </div>
            )}
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">Important Payment Information</p>
              <p>
                Your card will <strong>not be charged</strong> until your application is reviewed and approved by our team.
                The minimum dues contribution is $500/year to support the G3 Ministry's mission.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label htmlFor="paymentAmount" className="block text-sm font-medium text-gray-700">Annual Contribution Amount ($)</label>
                 <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">$</span>
                    </div>
                    <input
                      type="number"
                      name="paymentAmount"
                      id="paymentAmount"
                      min="500"
                      required
                      value={formData.paymentAmount}
                      onChange={(e) => setFormData({...formData, paymentAmount: parseInt(e.target.value) || 0})}
                      className="focus:ring-black focus:border-black block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md p-2 border"
                      placeholder="500"
                    />
                 </div>
                 <p className="text-xs text-gray-500 mt-1">Minimum: $500</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Frequency</label>
                <div className="mt-2 space-x-4 flex">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-black"
                      name="paymentFrequency"
                      value="yearly"
                      checked={formData.paymentFrequency === 'yearly'}
                      onChange={() => setFormData({...formData, paymentFrequency: 'yearly'})}
                    />
                    <span className="ml-2">Recurring (Auto-pay)</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-black"
                      name="paymentFrequency"
                      value="one_time"
                      checked={formData.paymentFrequency === 'one_time'}
                      onChange={() => setFormData({...formData, paymentFrequency: 'one_time'})}
                    />
                    <span className="ml-2">One-time (Manual Renewal)</span>
                  </label>
                </div>
              </div>
            </div>

            {!paymentReady ? (
              <div className="p-4 border border-yellow-300 rounded-md bg-yellow-50 text-yellow-800">
                <p className="font-semibold">Payment System Loading...</p>
                <p>If this message persists, the payment system may be misconfigured. Please contact support.</p>
              </div>
            ) : (
              <div className="p-4 border border-gray-300 rounded-md bg-white">
                <label className="block text-sm font-medium text-gray-700 mb-2">Credit Card Details</label>
                <div className="p-3 border rounded-md">
                  <CardElement options={CARD_ELEMENT_OPTIONS} />
                </div>
              </div>
            )}
            
          </fieldset>
          )}

          {paymentError && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded flex items-center">
              <span className="font-bold mr-2">Error:</span> {paymentError}
            </div>
          )}

          <div className="pt-6 flex items-center justify-between border-t">
            <div>
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setShowContactModal(true)}
                className="flex items-center text-gray-600 hover:text-black"
                disabled={isSubmitting}
              >
                <Mail className="w-4 h-4 mr-2" />
                Contact Us
              </Button>
            </div>
            <div className="flex space-x-4">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Create Account & Submit Application
              </Button>
            </div>
          </div>
        </form>
      </div>

      {showContactModal && (
        <ContactAdminModal onClose={() => setShowContactModal(false)} />
      )}
    </div>
  );
};

export const ApplicationForm: React.FC<ApplicationFormProps> = (props) => {
  return (
    <Elements stripe={stripePromise}>
      <ApplicationFormContent {...props} />
    </Elements>
  );
};
