import { useEffect, useMemo, useState } from "react";
import { Camera, FileSignature, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "@/lib/system-message.ts";
import { apiClient, getApiErrorMessage } from "@/api/client.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.profile.name ?? "");
  const [email, setEmail] = useState(user?.profile.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [phone, setPhone] = useState(user?.profile.phone ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [passwords, setPasswords] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [action, setAction] = useState<"profile" | "password" | null>(null);
  const preview = useMemo(() => avatar ? URL.createObjectURL(avatar) : user?.profile.avatarUrl ?? undefined, [avatar, user?.profile.avatarUrl]);
  const signaturePreview = useMemo(() => signature ? URL.createObjectURL(signature) : user?.profile.signatureUrl ?? undefined, [signature, user?.profile.signatureUrl]);
  useEffect(() => { if (!user) return; setName(user.profile.name ?? ""); setEmail(user.profile.email ?? ""); setPhone(user.profile.phone ?? ""); }, [user]);
  useEffect(() => () => { if (avatar && preview) URL.revokeObjectURL(preview); }, [avatar, preview]);
  useEffect(() => () => { if (signature && signaturePreview) URL.revokeObjectURL(signaturePreview); }, [signature, signaturePreview]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setAction("profile");
    const form = new FormData(); form.append("name", name); form.append("email", email.trim().toLowerCase()); form.append("phone", phone); form.append("current_password", emailPassword); form.append("_method", "PATCH"); if (avatar) form.append("avatar", avatar, avatar.name); if (signature) { const signatureFile = new File([signature], signature.name || "signature.png", { type: "image/png" }); form.append("signature", signatureFile, signatureFile.name); }
    try { await apiClient.post("/account/profile", form); await refreshUser(); setAvatar(null); setSignature(null); setEmailPassword(""); toast.success("Profile information updated"); }
    catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to update profile")); }
    finally { setAction(null); }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setAction("password");
    try { await apiClient.post("/account/password", passwords); setPasswords({ current_password: "", password: "", password_confirmation: "" }); toast.success("Password updated successfully"); }
    catch (cause) { toast.error(getApiErrorMessage(cause, "Unable to update password")); }
    finally { setAction(null); }
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return <div className="p-6 pb-24 md:pb-8">
    <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-6"><CardContent className="space-y-1 p-3"><button onClick={() => scrollTo("profile-information")} className="flex w-full items-center gap-3 rounded-md bg-muted px-3 py-2.5 text-left text-sm font-medium"><UserRound className="size-4" />Profile</button><button onClick={() => scrollTo("update-password")} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><LockKeyhole className="size-4" />Password</button></CardContent></Card>
      <div className="space-y-8">
        <Card id="profile-information" className="scroll-mt-6"><CardHeader><CardTitle>Profile Information</CardTitle><CardDescription>Update your account&apos;s profile information and contact details.</CardDescription></CardHeader><CardContent><form onSubmit={saveProfile} className="space-y-6">
          <div className="flex flex-wrap items-center gap-5"><Avatar className="size-20"><AvatarImage src={preview} alt={name} /><AvatarFallback className="text-xl">{name.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar><div><Label htmlFor="avatar" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"><Camera className="size-4" />Change Avatar</Label><Input id="avatar" className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setAvatar(event.target.files?.[0] ?? null)} /><p className="mt-2 text-xs text-muted-foreground">JPG, PNG, GIF or WebP up to 2 MB.</p></div></div>
          <Field label="Name" htmlFor="profile-name"><Input id="profile-name" required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Email address" htmlFor="profile-email"><Input id="profile-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /><p className="text-xs text-muted-foreground">This email is used to sign in and receive account notifications.</p></Field>
          {email.trim().toLowerCase() !== (user?.profile.email ?? "").toLowerCase() && <Field label="Current password" htmlFor="email-current-password"><Input id="email-current-password" type="password" required autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} placeholder="Confirm password to change email" /><p className="text-xs text-muted-foreground">Required to protect your account when changing the login email.</p></Field>}
          <Field label="Phone number" htmlFor="profile-phone"><Input id="profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter phone number" /></Field>
                    <div className="flex flex-wrap items-center gap-5 rounded-lg border p-4"><div className="flex size-24 items-center justify-center rounded-md bg-muted/30 p-2">{signaturePreview ? <img src={signaturePreview} alt="Digital signature preview" className="max-h-full max-w-full object-contain" /> : <span className="text-center text-xs text-muted-foreground">No signature uploaded</span>}</div><div><Label htmlFor="signature" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"><FileSignature className="size-4" />Upload digital signature</Label><Input id="signature" className="hidden" type="file" accept=".png,image/png" onChange={(event) => setSignature(event.target.files?.[0] ?? null)} /><p className="mt-2 text-xs text-muted-foreground">PNG with transparent background recommended, up to 1 MB.</p></div></div>
<br></br>
          <Button disabled={action !== null}>{action === "profile" && <Loader2 className="size-4 animate-spin" />}Save</Button>
        </form></CardContent></Card>

        <Card id="update-password" className="scroll-mt-6"><CardHeader><CardTitle>Update Password</CardTitle><CardDescription>Ensure your account is using a long, random password to stay secure.</CardDescription></CardHeader><CardContent><form onSubmit={savePassword} className="space-y-5">
          <PasswordField label="Current password" value={passwords.current_password} onChange={(current_password) => setPasswords({ ...passwords, current_password })} autoComplete="current-password" />
          <PasswordField label="New password" value={passwords.password} onChange={(password) => setPasswords({ ...passwords, password })} autoComplete="new-password" minLength={10} />
          <PasswordField label="Confirm password" value={passwords.password_confirmation} onChange={(password_confirmation) => setPasswords({ ...passwords, password_confirmation })} autoComplete="new-password" minLength={10} />
          <Button disabled={action !== null}>{action === "password" && <Loader2 className="size-4 animate-spin" />}Save</Button>
        </form></CardContent></Card>
      </div>
    </div>
  </div>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) { return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }
function PasswordField({ label, value, onChange, autoComplete, minLength }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; minLength?: number }) { return <Field label={label}><Input type="password" required minLength={minLength} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} /></Field>; }
