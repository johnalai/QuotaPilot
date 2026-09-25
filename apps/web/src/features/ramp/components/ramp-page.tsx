'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, User, Zap } from 'lucide-react';
import { completeOnboardingAction, skipOnboardingAction } from '@/app/(dashboard)/ramp/actions';

export function RampPage() {
  const [step, setStep] = useState<'role' | 'org' | 'quota'>('role');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    role: '' as string,
    teamName: '' as string,
    quotaAmount: '' as string,
    quotaCurrency: 'USD' as string,
  });

  const handleNext = async () => {
    setLoading(true);
    try {
      if (step === 'role') {
        setStep('org');
      } else if (step === 'org') {
        setStep('quota');
      } else if (step === 'quota') {
        // In a real implementation, we would save the quota plan here
        // For now, we'll just complete onboarding
        await completeOnboardingAction();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await skipOnboardingAction();
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'org') {
      setStep('role');
    } else if (step === 'quota') {
      setStep('org');
    }
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        {step === 'role' && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-bold">Let&apos;s get started</CardTitle>
              <CardDescription>
                First, tell us about your role so we can tailor your experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium">Your role</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    placeholder="e.g., Sales Rep, AE, Sales Manager"
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium">Team or company name</label>
                  <input
                    type="text"
                    value={formData.teamName}
                    onChange={(e) => handleChange('teamName', e.target.value)}
                    placeholder="Your team or company name"
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>
              </div>
            </CardContent>
          </>
        )}

        {step === 'org' && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-bold">Set up your quota</CardTitle>
              <CardDescription>
                Help us understand your quota target so we can provide relevant insights.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <Zap className="h-5 w-5 text-muted-foreground" />
                <div>
                  <label className="text-sm font-medium">Quota amount</label>
                  <div className="mt-1 flex items-baseline">
                    <input
                      type="number"
                      value={formData.quotaAmount}
                      onChange={(e) => handleChange('quotaAmount', e.target.value)}
                      placeholder="e.g., 50000"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                      min="0"
                    />
                    <select
                      value={formData.quotaCurrency}
                      onChange={(e) => handleChange('quotaCurrency', e.target.value as string)}
                      className="ml-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="CAD">CAD (C$)</option>
                      <option value="AUD">AUD (A$)</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        )}

        {step === 'quota' && (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-bold">Almost done</CardTitle>
              <CardDescription>Review your information and complete setup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Role</p>
                    <p className="text-sm">{formData.role || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Team/Company</p>
                    <p className="text-sm">{formData.teamName || 'Not set'}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Quota</p>
                    <p className="text-sm">
                      {formData.quotaAmount
                        ? `${formData.quotaAmount} {formData.quotaCurrency}`
                        : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        )}

        <div className="card-footer flex w-full items-center justify-between px-4 py-3">
          {step !== 'role' && (
            <Button variant="outline" onClick={handleBack} disabled={loading}>
              Back
            </Button>
          )}

          <Button
            variant="default"
            onClick={handleNext}
            disabled={
              loading ||
              (step === 'role' && (!formData.role || !formData.teamName)) ||
              (step === 'org' && !formData.quotaAmount)
            }
          >
            {step === 'quota' ? 'Complete Setup' : 'Next Step'}
          </Button>

          {step !== 'quota' && (
            <Button variant="outline" onClick={handleSkip} className="ml-2" disabled={loading}>
              Skip
            </Button>
          )}
        </div>
      </Card>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      )}
    </div>
  );
}
