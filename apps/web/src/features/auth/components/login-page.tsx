import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Credentials sign-in. Phase 1 wires Auth.js `signIn` + `callbackUrl` and the
 * interactive form; this is a server-rendered shell until then.
 */
export function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to QuotaPilot</CardTitle>
          <CardDescription>Credentials + Auth.js land in Phase 1.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" disabled className="w-full">
            Sign in
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
