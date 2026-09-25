'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Update } from 'lucide-react';

import { formatCurrency } from '@/lib/utils/format-currency';

interface ForecastData {
  forecastLines: Array<{
    month: string;
    amount: number;
    weightedAmount: number;
    confidence: number;
    opportunityCount: number;
  }>;
  pipelineTotal: number;
  weightedTotal: number;
  opportunityCount: number;
  quarterTotals: {
    committed: number;
    bestCase: number;
    pipeline: number;
  };
}

interface ForecastOverride {
  id: string;
  organizationId: string;
  month: string;
  committed: number;
  bestCase: number;
  pipeline: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function ForecastPage() {
  const router = useRouter();
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [overrides, setOverrides] = useState<ForecastOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    month: string;
    committed: number;
    bestCase: number;
    pipeline: number;
  }>({
    month: '',
    committed: 0,
    bestCase: 0,
    pipeline: 0,
  });

  // Fetch forecast data and overrides
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch forecast data (computed from opportunities)
        const forecastRes = await fetch('/api/forecast');
        const forecastJson = await forecastRes.json();
        if (!forecastJson.ok) {
          throw new Error(forecastJson.error?.message || 'Failed to fetch forecast');
        }
        setForecastData(forecastJson.data as ForecastData);

        // Fetch forecast overrides
        const overridesRes = await fetch('/api/forecast/overrides');
        const overridesJson = await overridesRes.json();
        if (!overridesJson.ok) {
          throw new Error(overridesJson.error?.message || 'Failed to fetch forecast overrides');
        }
        setOverrides(overridesJson.data as ForecastOverride[]);
      } catch (error) {
        console.error('Error fetching forecast data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load forecast data. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [router]);

  // Handle form submit for creating/updating override
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/forecast/values', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: editFormData.month,
          committed: editFormData.committed,
          bestCase: editFormData.bestCase,
          pipeline: editFormData.pipeline,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || 'Failed to save forecast override');
      }

      // Update the overrides list optimistically
      setOverrides(prev => {
        const existingIndex = prev.findIndex(o => o.month === editFormData.month);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...json.data as ForecastOverride,
            updatedAt: new Date(),
          };
          return updated;
        } else {
          return [...prev, { ...json.data as ForecastOverride, createdAt: new Date(), updatedAt: new Date() }];
        }
      });

      // Close the form and reset
      setEditingOverrideId(null);
      setEditFormData({
        month: '',
        committed: 0,
        bestCase: 0,
        pipeline: 0,
      });

      toast({
        title: 'Success',
        description: 'Forecast override saved successfully.',
      });
    } catch (error) {
      console.error('Error saving forecast override:', error);
      toast({
        title: 'Error',
        description: 'Failed to save forecast override. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Handle delete override
  async function handleDelete(month: string) {
    // Find the override to delete
    const overrideToDelete = overrides.find(o => o.month === month);
    if (!overrideToDelete) {
      toast({
        title: 'Error',
        description: 'Forecast override not found.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/forecast/overrides/${overrideToDelete.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || 'Failed to delete forecast override');
      }

      // Remove the deleted override from the list optimistically
      setOverrides(prev => prev.filter(o => o.id !== overrideToDelete.id));

      toast({
        title: 'Success',
        description: 'Forecast override deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting forecast override:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete forecast override. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Update className="h-8 w-8 animate-spin" />
          <p className="text-muted-foreground">Loading forecast data...</p>
        </div>
      </div>
    );
  }

  if (!forecastData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">No forecast data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Forecast</h1>
        <div className="flex items-center gap-4 mt-4 sm:mt-0">
          <Button variant="outline" onClick={() => setEditingOverrideId('new')}>
            Add Forecast Override
          </Button>
          <Button onClick={() => router.refresh()}>Refresh</Button>
        </div>
      </div>

      {/* Forecast Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Total</CardTitle>
            <CardDescription>
              Total committed amount of all open opportunities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">
              {formatCurrency(forecastData.pipelineTotal)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weighted Forecast</CardTitle>
            <CardDescription>
              Pipeline adjusted by stage probability
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">
              {formatCurrency(forecastData.weightedTotal)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Opportunities</CardTitle>
            <CardDescription>
              Number of active deals in pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">
              {forecastData.opportunityCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quarter Totals</CardTitle>
            <CardDescription>
              Current quarter forecast vs. committed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground flex justify-between">
                <span>Committed:</span>
                <span>{formatCurrency(forecastData.quarterTotals.committed)}</span>
              </div>
              <div className="text-sm text-muted-foreground flex justify-between">
                <span>Best Case:</span>
                <span>{formatCurrency(forecastData.quarterTotals.bestCase)}</span>
              </div>
              <div className="text-sm text-muted-foreground flex justify-between">
                <span>Pipeline:</span>
                <span>{formatCurrency(forecastData.quarterTotals.pipeline)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Lines Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Forecast</CardTitle>
          <CardDescription>
            Forecast breakdown by close month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Weighted Amount</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="text-right">Opportunities</TableHead>
                <TableHead className="text-right">Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forecastData.forecastLines.map(line => {
                const override = overrides.find(o => o.month === line.month);
                return (
                  <TableRow key={line.month}>
                    <TableCell>{new Date(line.month + '-01').toLocaleString('default', {
                      month: 'long',
                      year: 'numeric',
                    })}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(line.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(line.weightedAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(line.confidence * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {line.opportunityCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {override ? (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Committed: {formatCurrency(override.committed)}<br />
                            Best Case: {formatCurrency(override.bestCase)}<br />
                            Pipeline: {formatCurrency(override.pipeline)}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Update className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={4}>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingOverrideId(override.id);
                                  setEditFormData({
                                    month: override.month,
                                    committed: override.committed,
                                    bestCase: override.bestCase,
                                    pipeline: override.pipeline,
                                  });
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(override.month)} className="text-destructive">
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => {
                          setEditingOverrideId('new');
                          setEditFormData({
                            month: line.month,
                            committed: 0,
                            bestCase: 0,
                            pipeline: 0,
                          });
                        }}>
                          Add Override
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit/Add Forecast Override Sheet */}
      <Sheet>
        <SheetTrigger>
          <Button variant="outline" onClick={() => setEditingOverrideId('new')}>
            Add Forecast Override
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full md:w-[400px]">
          <SheetHeader>
            <SheetTitle>
              {editingOverrideId === 'new' ? 'Add Forecast Override' : 'Edit Forecast Override'}
            </SheetTitle>
            <SheetDescription>
              Enter the forecast override values for the selected month.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="month"
                value={editFormData.month}
                onChange={e => setEditFormData({ ...editFormData, month: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="committed">Committed Amount</Label>
              <Input
                id="committed"
                type="number"
                value={editFormData.committed}
                onChange={e => setEditFormData({ ...editFormData, committed: Number(e.target.value) || 0 })}
                required
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bestCase">Best Case Amount</Label>
              <Input
                id="bestCase"
                type="number"
                value={editFormData.bestCase}
                onChange={e => setEditFormData({ ...editFormData, bestCase: Number(e.target.value) || 0 })}
                required
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pipeline">Pipeline Amount</Label>
              <Input
                id="pipeline"
                type="number"
                value={editFormData.pipeline}
                onChange={e => setEditFormData({ ...editFormData, pipeline: Number(e.target.value) || 0 })}
                required
                min="0"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button type="button" variant="outline" onClick={() => setEditingOverrideId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}