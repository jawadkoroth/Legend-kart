'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './addresses.module.css';

/**
 * Addresses dashboard section.
 *
 * Full CRUD address book with default-address handling. RLS enforces
 * ownership server-side; this component never trusts the client.
 *
 *  - List + add + edit + delete + set-default
 *  - Inline modal form with strict validation
 *  - Optimistic-friendly: refetches after every mutation so the UI
 *    stays in lockstep with server state (including the auto-promote
 *    trigger that runs after deleting the default row).
 *  - Toasts for success / error; reduced-motion safe.
 */

export type Address = {
  id: string;
  label: string | null;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
  created_at: string;
};

type FieldErrors = Partial<Record<
  | 'full_name'
  | 'phone'
  | 'line1'
  | 'city'
  | 'state'
  | 'pincode',
  string
>>;

type FormState = {
  id: string | null;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  label: '',
  full_name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  is_default: false,
};

function normalisePhone(raw: string): string {
  // Keep digits only; if it looks like +91XXXXXXXXXX, drop the 91 prefix.
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.slice(-10);
}

function validateForm(f: FormState): FieldErrors {
  const e: FieldErrors = {};
  if (f.full_name.trim().length < 2) e.full_name = 'Recipient name is required';
  if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit phone number';
  if (f.line1.trim().length < 5) e.line1 = 'Address line is required';
  if (f.city.trim().length < 2) e.city = 'City is required';
  if (f.state.trim().length < 2) e.state = 'State is required';
  if (!/^\d{6}$/.test(f.pincode)) e.pincode = 'Enter a valid 6-digit pincode';
  return e;
}

export default function AddressesSection() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<Address[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const fetchAddresses = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from('addresses')
      .select('id,label,full_name,phone,line1,line2,city,state,pincode,country,is_default,created_at')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError('Could not load your addresses.');
      setList([]);
      return;
    }
    setList((data ?? []) as Address[]);
  }, [supabase]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  }

  function openEdit(a: Address) {
    setForm({
      id: a.id,
      label: a.label ?? '',
      full_name: a.full_name,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? '',
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      is_default: a.is_default,
    });
    setErrors({});
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
  }

  async function handleSave() {
    const trimmed: FormState = {
      ...form,
      label: form.label.trim(),
      full_name: form.full_name.trim(),
      phone: normalisePhone(form.phone),
      line1: form.line1.trim(),
      line2: form.line2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.replace(/\D/g, '').slice(0, 6),
    };
    const fieldErrors = validateForm(trimmed);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      setForm(trimmed);
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      showToast('err', 'You are signed out. Please sign in again.');
      return;
    }

    const isFirstEver = (list?.length ?? 0) === 0;
    const wantDefault = trimmed.is_default || isFirstEver;

    const payload = {
      user_id: user.id,
      label: trimmed.label || null,
      full_name: trimmed.full_name,
      phone: trimmed.phone,
      line1: trimmed.line1,
      line2: trimmed.line2 || null,
      city: trimmed.city,
      state: trimmed.state,
      pincode: trimmed.pincode,
      country: 'India',
    };

    let upsertedId: string | null = null;
    let upsertError: string | null = null;

    if (trimmed.id) {
      const { data, error } = await supabase
        .from('addresses')
        .update(payload)
        .eq('id', trimmed.id)
        .select('id')
        .single();
      if (error) upsertError = error.message;
      else upsertedId = data?.id ?? trimmed.id;
    } else {
      const { data, error } = await supabase
        .from('addresses')
        .insert(payload)
        .select('id')
        .single();
      if (error) upsertError = error.message;
      else upsertedId = data?.id ?? null;
    }

    if (upsertError || !upsertedId) {
      setSaving(false);
      showToast('err', 'Could not save address. Please try again.');
      return;
    }

    if (wantDefault) {
      const { error: rpcErr } = await supabase.rpc('set_default_address', {
        p_id: upsertedId,
      });
      if (rpcErr) {
        // Save succeeded; only the default flag failed. Surface a soft warning.
        showToast('err', 'Saved, but could not set as default.');
      }
    }

    await fetchAddresses();
    setSaving(false);
    setShowForm(false);
    showToast('ok', trimmed.id ? 'Address updated' : 'Address added');
  }

  async function handleSetDefault(a: Address) {
    if (a.is_default) return;
    const prev = list ?? [];
    // Optimistic flip.
    setList(prev.map(x => ({ ...x, is_default: x.id === a.id })));
    const { error } = await supabase.rpc('set_default_address', { p_id: a.id });
    if (error) {
      setList(prev);
      showToast('err', 'Could not set default address.');
      return;
    }
    showToast('ok', 'Default address updated');
    fetchAddresses();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) {
      showToast('err', 'Could not delete address.');
      return;
    }
    setConfirmDelete(null);
    showToast('ok', 'Address deleted');
    fetchAddresses();
  }

  /* ---------------------------- render ---------------------------- */

  return (
    <div className={styles.root}>
      {toast && (
        <div
          className={`${styles.toast} ${toast.kind === 'err' ? styles.toastError : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      )}

      {loadError && (
        <div className={styles.error} role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            className={styles.errorRetry}
            onClick={fetchAddresses}
          >
            Retry
          </button>
        </div>
      )}

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={openAdd}
          disabled={list === null}
        >
          + Add address
        </button>
      </div>

      {list === null ? (
        <div className={styles.list} aria-busy="true" aria-live="polite">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          No saved addresses yet. Add one to speed up future checkouts.
        </div>
      ) : (
        <ul className={styles.list}>
          {list.map(a => (
            <li
              key={a.id}
              className={`${styles.card} ${a.is_default ? styles.cardDefault : ''}`}
            >
              <div>
                <div className={styles.cardHead}>
                  <span className={styles.cardLabel}>
                    {a.label || a.full_name}
                  </span>
                  {a.is_default && (
                    <span className={styles.defaultBadge}>Default</span>
                  )}
                </div>
                <div className={styles.cardBody}>
                  <span className={styles.cardName}>{a.full_name}</span>
                  <span>
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}
                  </span>
                  <span>
                    {a.city}, {a.state} — {a.pincode}
                  </span>
                  <span className={styles.cardPhone}>+91 {a.phone}</span>
                </div>
              </div>
              <div className={styles.cardActions}>
                {!a.is_default && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => handleSetDefault(a)}
                  >
                    Set default
                  </button>
                )}
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => openEdit(a)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => setConfirmDelete(a)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <Modal title={form.id ? 'Edit address' : 'Add address'} onClose={closeForm}>
          <div className={styles.form}>
            <Field
              label="Label (optional)"
              value={form.label}
              onChange={v => setForm({ ...form, label: v })}
              placeholder="Home, Office…"
              maxLength={40}
            />
            <Field
              label="Recipient name"
              value={form.full_name}
              onChange={v => setForm({ ...form, full_name: v })}
              error={errors.full_name}
              maxLength={100}
              required
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={v => setForm({ ...form, phone: v.replace(/\D/g, '').slice(0, 10) })}
              error={errors.phone}
              inputMode="numeric"
              maxLength={10}
              required
            />
            <Field
              label="Address line 1"
              value={form.line1}
              onChange={v => setForm({ ...form, line1: v })}
              error={errors.line1}
              maxLength={200}
              required
            />
            <Field
              label="Address line 2 (optional)"
              value={form.line2}
              onChange={v => setForm({ ...form, line2: v })}
              maxLength={200}
            />
            <div className={styles.row2}>
              <Field
                label="City"
                value={form.city}
                onChange={v => setForm({ ...form, city: v })}
                error={errors.city}
                maxLength={100}
                required
              />
              <Field
                label="State"
                value={form.state}
                onChange={v => setForm({ ...form, state: v })}
                error={errors.state}
                maxLength={100}
                required
              />
            </div>
            <Field
              label="Pincode"
              value={form.pincode}
              onChange={v => setForm({ ...form, pincode: v.replace(/\D/g, '').slice(0, 6) })}
              error={errors.pincode}
              inputMode="numeric"
              maxLength={6}
              required
            />

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={form.is_default}
                onChange={e => setForm({ ...form, is_default: e.target.checked })}
              />
              Set as default address
            </label>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add address'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete address?"
          onClose={() => !deleting && setConfirmDelete(null)}
        >
          <p className={styles.confirmText}>
            This will permanently remove
            {' '}
            <strong>{confirmDelete.label || confirmDelete.full_name}</strong>
            {' '}from your address book. Past orders are not affected.
          </p>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local primitives                                                    */
/* ------------------------------------------------------------------ */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength?: number;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? 'true' : undefined}
      />
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  );
}
