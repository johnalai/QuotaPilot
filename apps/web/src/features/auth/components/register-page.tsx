import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from './register-form';

/**
 * Sign-up. Phase 1 creates `User` + `Organization` + `Membership(owner)` in one
 * transaction, then routes to the ramp (30/60/90) wizard. Shell until then.
 */
export function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>First user of an org becomes its owner (Phase 1).</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </main>
  );
}
