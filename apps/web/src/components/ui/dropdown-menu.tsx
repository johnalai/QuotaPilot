'use client';

import * as React from 'react';

import { Menu } from '@base-ui/react/menu';

import { cn } from 'cn';

/**
 * Dropdown menu built on Base UI's `Menu` primitive — the same primitive
 * library `Button` uses, rather than a second one.
 *
 * Base UI expresses "render as my child element" with a `render` prop, not
 * Radix's `asChild`. `asChild` is accepted here as a thin compatibility shim so
 * shadcn-style call sites keep working.
 */

const DropdownMenu = Menu.Root;

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof Menu.Trigger> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return <Menu.Trigger render={children} {...props} />;
  }

  return (
    <Menu.Trigger data-slot="dropdown-menu-trigger" {...props}>
      {children}
    </Menu.Trigger>
  );
}

type DropdownMenuContentProps = React.ComponentProps<typeof Menu.Popup> &
  Pick<React.ComponentProps<typeof Menu.Positioner>, 'align' | 'side' | 'sideOffset'>;

function DropdownMenuContent({
  className,
  children,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} side={side} sideOffset={sideOffset} className="z-50">
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'min-w-32 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none',
            className,
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none',
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function DropdownMenuGroup({ className, ...props }: React.ComponentProps<typeof Menu.Group>) {
  return <Menu.Group data-slot="dropdown-menu-group" className={cn(className)} {...props} />;
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.GroupLabel>) {
  return (
    <Menu.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
};
