import React, { useState } from 'react';
import { Button } from './Button';
import { ChurchApplication, ApplicationStatus, ChurchLeader, ChurchGathering } from '../types';
import { ArrowLeft, Plus, Trash2, Mail } from 'lucide-react';
import { ContactAdminModal } from './ContactAdminModal';

interface ApplicationFormProps {
  onSubmit: (app: Omit<ChurchApplication, 'id'>) => void;
  onCancel: () => void;
}

// Initial state constant
const INITIAL_STATE = {
  applicantFirstName: '',
  applicantLastName: '',
  applicantEmail: '',
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
};

export const ApplicationForm: React.FC<ApplicationFormProps> = ({ onSubmit, onCancel }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState(INITIAL_STATE);
  const [showContactModal, setShowContactModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Prepare Application Data
      const newApplication: Omit<ChurchApplication, 'id' | 'coordinates' | 'userId'> = {
        ...formData,
        status: ApplicationStatus.PENDING,
        submittedAt: new Date().toISOString(),
      };

      // Submit
      await onSubmit(newApplication);

    } catch (error: any) {
      console.error("Form submission error:", error);
      alert(error.message || 'An unexpected error occurred.');
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
          <p className="text-gray-300 mt-2">Submit your application to join our global fellowship</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-10">

          {/* Applicant Information */}
          <fieldset className="space-y-6">
            <legend className="text-xl font-serif font-semibold text-gray-900 border-b pb-2 w-full">Primary Contact</legend>
            <p className="text-sm text-gray-600">Your contact information for application follow-up</p>

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
              <label htmlFor="applicantEmail" className="block text-sm font-medium text-gray-700">Email Address *</label>
              <input type="email" name="applicantEmail" id="applicantEmail" placeholder="name@example.com" required onChange={handleChange} value={formData.applicantEmail} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black" />
            </div>
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
                Submit Application
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
