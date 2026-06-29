import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useDeviceStore, Device } from '../store/deviceStore';
import { useAuthStore } from '../store/authStore';

export default function ManageDevicesPage() {
  const navigate = useNavigate();
  const devices = useDeviceStore((s) => s.devices);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const addDevice = useDeviceStore((s) => s.addDevice);
  const removeDevice = useDeviceStore((s) => s.removeDevice);
  const updateDevice = useDeviceStore((s) => s.updateDevice);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Device | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formPlate, setFormPlate] = useState('');
  const [formType, setFormType] = useState('');
  const [formToken, setFormToken] = useState('');

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getDevices();
      setDevices(data.devices);
    } catch (err: any) {
      setError(err.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingDevice(null);
    setFormName('');
    setFormPlate('');
    setFormType('');
    setFormToken('');
    setShowForm(true);
  }

  function openEditForm(device: Device) {
    setEditingDevice(device);
    setFormName(device.name);
    setFormPlate(device.plate_number || '');
    setFormType(device.vehicle_type || '');
    setFormToken((device as any).device_token || '');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingDevice(null);
  }

  async function handleSave() {
    if (!formName.trim() || !formToken.trim()) {
      setError('Name and Device Token are required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingDevice) {
        // Update existing
        const data = await api.updateDevice(editingDevice.id, {
          name: formName.trim(),
          plate_number: formPlate.trim() || undefined,
          vehicle_type: formType.trim() || undefined,
          device_token: formToken.trim(),
        });
        updateDevice(editingDevice.id, data.device);
      } else {
        // Create new
        const data = await api.createDevice({
          name: formName.trim(),
          plate_number: formPlate.trim() || undefined,
          vehicle_type: formType.trim() || undefined,
          device_token: formToken.trim(),
        });
        addDevice(data.device);
      }

      closeForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save device');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(device: Device) {
    try {
      setDeletingId(device.id);
      setError('');
      await api.deleteDevice(device.id);
      removeDevice(device.id);
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete device');
    } finally {
      setDeletingId(null);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="h-dvh flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold tracking-tight">Manage Devices</h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden sm:inline text-sm text-gray-400">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white whitespace-nowrap">Logout</button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Devices ({devices.length})
            </h2>
          </div>
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Device
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500" />
            Loading devices...
          </div>
        )}

        {/* Device table */}
        {!loading && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            {/* Table header — hidden on mobile, visible on sm+ */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-800/50 border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider font-medium">
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Plate</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-3">Token</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {devices.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No devices yet. Click "Add Device" to create one.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="sm:grid sm:grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-800/30 transition-colors flex flex-col sm:flex-row sm:items-center"
                  >
                    {/* Name + status */}
                    <div className="sm:col-span-3 flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          device.status === 'online' ? 'bg-green-500 pulse-dot' : 'bg-red-500'
                        }`}
                      />
                      <span className="text-sm text-white font-medium truncate">{device.name}</span>
                    </div>

                    {/* Plate */}
                    <div className="sm:col-span-2 text-sm text-gray-400 truncate sm:mt-0 mt-1 ml-4">
                      {device.plate_number || '—'}
                    </div>

                    {/* Type */}
                    <div className="sm:col-span-2 text-sm text-gray-400 truncate sm:mt-0 mt-0.5 ml-4">
                      {device.vehicle_type || '—'}
                    </div>

                    {/* Token */}
                    <div className="sm:col-span-3 text-xs text-gray-500 font-mono truncate sm:mt-0 mt-0.5 ml-4">
                      {(device as any).device_token || '—'}
                    </div>

                    {/* Actions */}
                    <div className="sm:col-span-2 flex items-center gap-2 sm:justify-end sm:mt-0 mt-2 ml-4">
                      <button
                        onClick={() => navigate(`/device/${device.id}`)}
                        className="text-xs text-primary-500 hover:text-primary-400 transition-colors"
                        title="View details"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openEditForm(device)}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                        title="Edit device"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(device)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        title="Delete device"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Add / Edit Device ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={closeForm} />

          {/* Form card */}
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">
              {editingDevice ? 'Edit Device' : 'Add Device'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors"
                  placeholder="e.g. Motor Alpha"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Plate Number
                </label>
                <input
                  type="text"
                  value={formPlate}
                  onChange={(e) => setFormPlate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors"
                  placeholder="e.g. B 1234 ABC"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Vehicle Type
                </label>
                <input
                  type="text"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors"
                  placeholder="e.g. Honda Vario 150"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1">
                  Device Token <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors font-mono"
                  placeholder="e.g. dev-token-alpha-001"
                />
                <p className="text-[10px] text-gray-600 mt-1">
                  Unique identifier — must match the real device or simulator token.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeForm}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : editingDevice ? 'Save Changes' : 'Create Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Device</h3>
            <p className="text-sm text-gray-400 mb-4">
              Are you sure you want to delete <strong className="text-white">{confirmDelete.name}</strong>?
              This will remove all location history, sensor data, and alerts for this device. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {deletingId === confirmDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
