# Primer React Component Reference

This is a comprehensive reference for `@primer/react` -- GitHub's React design system. Use these components instead of building custom ones. All components are imported from `@primer/react` unless noted otherwise.

Install: `npm install @primer/react @primer/octicons-react`

## Setup

Every Primer app must be wrapped in ThemeProvider and BaseStyles:

```tsx
import {ThemeProvider, BaseStyles} from '@primer/react'

function App() {
  return (
    <ThemeProvider>
      <BaseStyles>
        {/* your app */}
      </BaseStyles>
    </ThemeProvider>
  )
}
```

ThemeProvider props:
- `colorMode`: 'day' | 'night' | 'light' | 'dark' | 'auto'
- `dayScheme` / `nightScheme`: color scheme names
- `preventSSRMismatch`: boolean (for SSR hydration)

Use `useTheme()` hook to access theme context.

## Icons (Octicons)

Import from `@primer/octicons-react` (not from `@primer/react`):

```tsx
import {SearchIcon, HeartIcon, GearIcon, PlusIcon, XIcon} from '@primer/octicons-react'
```

Icons are used as `leadingVisual` / `trailingVisual` props on many components, or rendered directly. Full icon set: https://primer.style/foundations/icons

Kanbanana icon sizing rules:

- Default to no `size` prop (Octicons default is 16px).
- When you need a larger icon, use named sizes (`small`, `medium`, `large`) instead of numeric sizes.
- Avoid hardcoded numeric icon sizes like `size={16}` or `size={20}` unless there is a clear one-off visual requirement.
- Prefer `verticalAlign="middle"` only when alignment is visually off in context.

---

## Components

### Buttons

#### Button
```tsx
import {Button} from '@primer/react'

<Button variant="primary">Save</Button>
<Button variant="danger" leadingVisual={TrashIcon}>Delete</Button>
<Button variant="invisible" size="small">Cancel</Button>
<Button loading>Saving...</Button>
<Button count={12}>Issues</Button>
<Button block>Full width</Button>
```

Props:
- `variant`: 'default' | 'primary' | 'invisible' | 'danger' | 'link'
- `size`: 'small' | 'medium' | 'large'
- `disabled`, `loading`, `block`, `inactive`: boolean
- `labelWrap`: boolean (allow text wrapping)
- `leadingVisual`: React.ElementType (icon component)
- `trailingVisual`: React.ElementType (icon component)
- `trailingAction`: React.ElementType (icon for trailing action)
- `count`: number | string (counter badge)
- `alignContent`: 'start' | 'center'

#### IconButton
```tsx
import {IconButton} from '@primer/react'

<IconButton icon={SearchIcon} aria-label="Search" />
<IconButton icon={GearIcon} aria-label="Settings" variant="invisible" size="small" />
```

Props: same as Button plus `icon` (required) and `aria-label` (required).

#### LinkButton
```tsx
import {LinkButton} from '@primer/react'

<LinkButton href="/settings">Settings</LinkButton>
```

Renders as an anchor tag styled as a button. Same visual props as Button.

#### ButtonGroup
```tsx
import {ButtonGroup} from '@primer/react'

<ButtonGroup>
  <Button>Button 1</Button>
  <Button>Button 2</Button>
  <IconButton icon={TriangleDownIcon} aria-label="More" />
</ButtonGroup>
```

---

### Form Controls

#### FormControl
Wraps form inputs with labels, captions, and validation messages.

```tsx
import {FormControl, TextInput, Checkbox, Select, Textarea, Radio} from '@primer/react'

<FormControl required>
  <FormControl.Label>Name</FormControl.Label>
  <FormControl.Caption>Enter your full name</FormControl.Caption>
  <TextInput />
</FormControl>

<FormControl>
  <FormControl.Label>Description</FormControl.Label>
  <FormControl.Validation variant="error">Too short</FormControl.Validation>
  <Textarea />
</FormControl>
```

Props:
- `disabled`, `required`: boolean
- `id`: string
- `layout`: 'horizontal' | 'vertical'
- Subcomponents: FormControl.Label, FormControl.Caption, FormControl.LeadingVisual, FormControl.Validation

#### TextInput
```tsx
<TextInput
  leadingVisual={SearchIcon}
  trailingVisual={XIcon}
  placeholder="Search..."
  size="medium"
  block
/>
```

Props:
- `leadingVisual`, `trailingVisual`: React.ElementType | React.ReactNode
- `trailingAction`: React.ReactElement
- `loading`: boolean
- `loaderPosition`: 'auto' | 'leading' | 'trailing'
- `block`, `contrast`, `monospace`: boolean
- `size`: 'small' | 'medium' | 'large'
- `validationStatus`: 'error' | 'success' | 'warning'
- `characterLimit`: number
- Extends standard HTML input attributes

#### Textarea
```tsx
<Textarea rows={5} resize="vertical" block placeholder="Write a comment..." />
```

Props:
- `resize`: 'none' | 'both' | 'horizontal' | 'vertical'
- `rows`, `cols`: number
- `minHeight`, `maxHeight`: number
- `block`, `contrast`: boolean
- `validationStatus`: 'error' | 'success' | 'warning'
- `characterLimit`: number

#### Select
```tsx
<Select>
  <Select.Option value="one">Option 1</Select.Option>
  <Select.Option value="two">Option 2</Select.Option>
  <Select.OptGroup label="Group">
    <Select.Option value="three">Option 3</Select.Option>
  </Select.OptGroup>
</Select>
```

Props:
- `block`, `disabled`, `required`: boolean
- `placeholder`: string
- `size`: 'small' | 'medium' | 'large'
- `validationStatus`: 'error' | 'success' | 'warning'

#### Checkbox
```tsx
<FormControl>
  <Checkbox value="terms" />
  <FormControl.Label>I agree to the terms</FormControl.Label>
</FormControl>
```

Props: `indeterminate`, `disabled`, `required`, `validationStatus`, `value`

#### Radio
```tsx
<Radio value="option1" name="group1" />
```

#### CheckboxGroup / RadioGroup
```tsx
<CheckboxGroup>
  <CheckboxGroup.Label>Choices</CheckboxGroup.Label>
  <FormControl>
    <Checkbox value="a" />
    <FormControl.Label>Option A</FormControl.Label>
  </FormControl>
  <FormControl>
    <Checkbox value="b" />
    <FormControl.Label>Option B</FormControl.Label>
  </FormControl>
</CheckboxGroup>
```

#### ToggleSwitch
```tsx
<ToggleSwitch aria-labelledby="label-id" size="small" />
<ToggleSwitch checked={on} onChange={setOn} aria-labelledby="label-id" />
```

Props:
- `checked`, `defaultChecked`, `disabled`, `loading`: boolean
- `onChange`: (checked: boolean) => void
- `size`: 'small' | 'medium'
- `aria-labelledby`: string (required)

#### Autocomplete
```tsx
import Autocomplete from '@primer/react'

<Autocomplete>
  <Autocomplete.Input placeholder="Search..." />
  <Autocomplete.Overlay>
    <Autocomplete.Menu
      items={items}
      selectedItemIds={selected}
    />
  </Autocomplete.Overlay>
</Autocomplete>
```

Items format: `{id: string, text: string, ...}`

#### TextInputWithTokens
```tsx
import TextInputWithTokens from '@primer/react'

<TextInputWithTokens
  tokens={tokens}
  onTokenRemove={handleRemove}
/>
```

---

### Actions and Menus

#### ActionList
A list of interactive items. Used standalone or inside ActionMenu/SelectPanel.

```tsx
import {ActionList} from '@primer/react'

<ActionList>
  <ActionList.Item onSelect={() => console.log('clicked')}>
    <ActionList.LeadingVisual><LinkIcon /></ActionList.LeadingVisual>
    Copy link
    <ActionList.Description>Copy to clipboard</ActionList.Description>
  </ActionList.Item>
  <ActionList.Divider />
  <ActionList.Item variant="danger">
    <ActionList.LeadingVisual><TrashIcon /></ActionList.LeadingVisual>
    Delete
  </ActionList.Item>
</ActionList>
```

ActionList props:
- `variant`: 'inset' | 'horizontal-inset' | 'full'
- `selectionVariant`: 'single' | 'radio' | 'multiple'
- `showDividers`: boolean

ActionList.Item props:
- `selected`, `active`, `disabled`, `loading`: boolean
- `variant`: 'default' | 'danger'
- `onSelect`: (event) => void
- `inactiveText`: string

Subcomponents: ActionList.Item, ActionList.Group, ActionList.Heading, ActionList.GroupHeading, ActionList.Divider, ActionList.Description, ActionList.LeadingVisual, ActionList.TrailingVisual, ActionList.TrailingAction

#### ActionMenu
Dropdown menu triggered by a button.

```tsx
import {ActionMenu, ActionList} from '@primer/react'

<ActionMenu>
  <ActionMenu.Button>Menu</ActionMenu.Button>
  <ActionMenu.Overlay width="medium">
    <ActionList>
      <ActionList.Item onSelect={() => alert('Edit')}>Edit</ActionList.Item>
      <ActionList.Item onSelect={() => alert('Delete')} variant="danger">Delete</ActionList.Item>
    </ActionList>
  </ActionMenu.Overlay>
</ActionMenu>
```

Props:
- `open`: boolean (controlled)
- `onOpenChange`: (open: boolean) => void
- Subcomponents: ActionMenu.Button, ActionMenu.Anchor, ActionMenu.Overlay

#### ActionBar
Toolbar with overflow handling (items that don't fit collapse into a "more" menu).

```tsx
import {ActionBar} from '@primer/react'

<ActionBar aria-label="Toolbar">
  <ActionBar.IconButton icon={BoldIcon} aria-label="Bold" />
  <ActionBar.IconButton icon={ItalicIcon} aria-label="Italic" />
  <ActionBar.VerticalDivider />
  <ActionBar.IconButton icon={LinkIcon} aria-label="Link" />
</ActionBar>
```

Props:
- `size`: 'small' | 'medium' | 'large'
- `flush`: boolean
- `gap`: 'none' | 'condensed'
- Subcomponents: ActionBar.IconButton, ActionBar.Menu, ActionBar.Group, ActionBar.VerticalDivider

---

### Selection

#### SelectPanel
A panel for selecting items from a filterable list.

```tsx
import {SelectPanel} from '@primer/react'

const [selected, setSelected] = useState([])
const [open, setOpen] = useState(false)

<SelectPanel
  title="Select labels"
  renderAnchor={({children, ...anchorProps}) => (
    <Button trailingAction={TriangleDownIcon} {...anchorProps}>
      {children}
    </Button>
  )}
  open={open}
  onOpenChange={setOpen}
  items={items}
  selected={selected}
  onSelectedChange={setSelected}
  onFilterChange={setFilter}
/>
```

Props:
- `title`: React.ReactNode
- `onClose`: () => void
- `items`, `selected`, `onSelectedChange`, `onFilterChange`
- Subcomponents: SelectPanel.Header, SelectPanel.Footer, SelectPanel.Button

#### SegmentedControl
Toggle between a set of related views.

```tsx
import {SegmentedControl} from '@primer/react'

<SegmentedControl aria-label="File view">
  <SegmentedControl.Button defaultSelected>Preview</SegmentedControl.Button>
  <SegmentedControl.Button>Raw</SegmentedControl.Button>
  <SegmentedControl.Button>Blame</SegmentedControl.Button>
</SegmentedControl>
```

Props:
- `aria-label` or `aria-labelledby` (required)
- `fullWidth`: boolean | ResponsiveValue
- `onChange`: (selectedIndex: number) => void
- `size`: 'small' | 'medium'
- `variant`: 'default' | ResponsiveValue<'hideLabels' | 'dropdown' | 'default'>
- Subcomponents: SegmentedControl.Button, SegmentedControl.IconButton

---

### Dialogs and Overlays

#### Dialog
```tsx
import {Dialog} from '@primer/react'

const [isOpen, setIsOpen] = useState(false)

{isOpen && (
  <Dialog
    title="Confirm action"
    subtitle="This cannot be undone"
    onClose={() => setIsOpen(false)}
    width="medium"
    footerButtons={[
      {buttonType: 'default', content: 'Cancel', onClick: () => setIsOpen(false)},
      {buttonType: 'danger', content: 'Delete', onClick: handleDelete},
    ]}
  >
    <p>Are you sure you want to delete this?</p>
  </Dialog>
)}
```

Props:
- `title`, `subtitle`: React.ReactNode
- `onClose`: (gesture: 'close-button' | 'escape') => void
- `role`: 'dialog' | 'alertdialog'
- `width`: 'small' | 'medium' | 'large' | 'xlarge'
- `height`: 'small' | 'large' | 'auto'
- `position`: 'center' | 'left' | 'right' | ResponsiveValue
- `footerButtons`: DialogButtonProps[] (each has `buttonType`, `content`, `onClick`)
- `returnFocusRef`, `initialFocusRef`: React.RefObject
- Subcomponents: Dialog.Header, Dialog.Title, Dialog.Subtitle, Dialog.Body, Dialog.Footer, Dialog.Buttons, Dialog.CloseButton

#### ConfirmationDialog
```tsx
import {ConfirmationDialog, useConfirm} from '@primer/react'

// Hook approach:
const confirm = useConfirm()
const result = await confirm({title: 'Delete?', content: 'This cannot be undone'})

// Component approach:
<ConfirmationDialog
  title="Delete item?"
  onClose={(gesture) => {/* 'confirm' or 'cancel' or 'close-button' or 'escape' */}}
  confirmButtonContent="Delete"
  confirmButtonType="danger"
>
  This action cannot be undone.
</ConfirmationDialog>
```

#### Overlay
```tsx
import Overlay from '@primer/react'

<Overlay returnFocusRef={buttonRef} onEscape={() => setOpen(false)} onClickOutside={() => setOpen(false)}>
  {content}
</Overlay>
```

#### AnchoredOverlay
Overlay anchored to a trigger element with positioning.

```tsx
import {AnchoredOverlay} from '@primer/react'

<AnchoredOverlay
  renderAnchor={(props) => <Button {...props}>Open</Button>}
  open={isOpen}
  onOpen={() => setIsOpen(true)}
  onClose={() => setIsOpen(false)}
>
  {content}
</AnchoredOverlay>
```

#### Tooltip
```tsx
import {Tooltip} from '@primer/react'

<Tooltip text="This saves your work" direction="s">
  <Button>Save</Button>
</Tooltip>

<Tooltip text="Bold (Ctrl+B)" type="label" direction="s">
  <IconButton icon={BoldIcon} aria-label="Bold" />
</Tooltip>
```

Props:
- `text`: string (required)
- `direction`: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
- `type`: 'label' | 'description'
- `delay`: 'short' | 'medium' | 'long' (50ms, 400ms, 1200ms)

#### Popover
```tsx
import Popover from '@primer/react'

<Popover open caret="top">
  <Popover.Content>
    <Heading as="h4">Popover title</Heading>
    <Text>Content</Text>
  </Popover.Content>
</Popover>
```

Props: `open`, `caret` ('top' | 'bottom' | 'left' | 'right' and more directional variants)

---

### Navigation

#### NavList
Vertical navigation list with nested sub-navigation support.

```tsx
import {NavList} from '@primer/react'

<NavList>
  <NavList.Item href="/dashboard" aria-current="page">Dashboard</NavList.Item>
  <NavList.Item href="/settings">
    <NavList.LeadingVisual><GearIcon /></NavList.LeadingVisual>
    Settings
    <NavList.SubNav>
      <NavList.Item href="/settings/profile">Profile</NavList.Item>
      <NavList.Item href="/settings/billing">Billing</NavList.Item>
    </NavList.SubNav>
  </NavList.Item>
</NavList>
```

NavList.Item props: `href`, `aria-current`, `defaultOpen`, `inactiveText`
Subcomponents: NavList.Item, NavList.SubNav, NavList.Group, NavList.LeadingVisual, NavList.TrailingVisual, NavList.TrailingAction, NavList.Divider, NavList.GroupHeading

#### UnderlineNav
Horizontal tab-style navigation with overflow handling.

```tsx
import {UnderlineNav} from '@primer/react'

<UnderlineNav aria-label="Repository">
  <UnderlineNav.Item aria-current="page" counter={30}>Code</UnderlineNav.Item>
  <UnderlineNav.Item counter={1}>Issues</UnderlineNav.Item>
  <UnderlineNav.Item>Pull requests</UnderlineNav.Item>
</UnderlineNav>
```

#### Breadcrumbs
```tsx
import Breadcrumbs from '@primer/react'

<Breadcrumbs>
  <Breadcrumbs.Item href="/">Home</Breadcrumbs.Item>
  <Breadcrumbs.Item href="/about">About</Breadcrumbs.Item>
  <Breadcrumbs.Item href="/about/team" selected>Team</Breadcrumbs.Item>
</Breadcrumbs>
```

#### Pagination
```tsx
import Pagination from '@primer/react'

<Pagination pageCount={15} currentPage={3} onPageChange={(e, page) => setPage(page)} />
```

Props: `pageCount`, `currentPage`, `onPageChange`, `hrefBuilder`, `marginPageCount`, `surroundingPageCount`

#### SideNav (deprecated -- use NavList)
#### SubNav
```tsx
import SubNav from '@primer/react'

<SubNav aria-label="Main">
  <SubNav.Links>
    <SubNav.Link href="#" selected>Overview</SubNav.Link>
    <SubNav.Link href="#">Repositories</SubNav.Link>
  </SubNav.Links>
</SubNav>
```

---

### Layout

#### PageLayout
Full page layout with header, content, pane, and footer regions.

```tsx
import {PageLayout} from '@primer/react'

<PageLayout containerWidth="xlarge" padding="normal">
  <PageLayout.Header>
    <h2>Header</h2>
  </PageLayout.Header>
  <PageLayout.Content>
    <p>Main content</p>
  </PageLayout.Content>
  <PageLayout.Pane position="end" width="medium">
    <p>Sidebar</p>
  </PageLayout.Pane>
  <PageLayout.Footer>
    <p>Footer</p>
  </PageLayout.Footer>
</PageLayout>
```

Props:
- `containerWidth`: 'full' | 'medium' | 'large' | 'xlarge'
- `padding`: 'none' | 'condensed' | 'normal'
- `rowGap`, `columnGap`: 'none' | 'condensed' | 'normal'
- Subcomponents: PageLayout.Header, PageLayout.Content, PageLayout.Pane, PageLayout.Footer, PageLayout.Divider

Pane props: `position` ('start' | 'end'), `width` ('small' | 'medium' | 'large'), `sticky`, `divider` ('none' | 'line' | 'filled'), `resizable`, `onResizeEnd`, `currentWidth`

#### SplitPageLayout
Variant of PageLayout optimized for split-pane views.

```tsx
import {SplitPageLayout} from '@primer/react'

<SplitPageLayout>
  <SplitPageLayout.Header>Header</SplitPageLayout.Header>
  <SplitPageLayout.Pane>Sidebar</SplitPageLayout.Pane>
  <SplitPageLayout.Content>Main</SplitPageLayout.Content>
  <SplitPageLayout.Footer>Footer</SplitPageLayout.Footer>
</SplitPageLayout>
```

#### PageHeader
Page-level header with title, actions, and context areas.

```tsx
import {PageHeader} from '@primer/react'

<PageHeader>
  <PageHeader.ContextArea>
    <PageHeader.ParentLink href="/repos">Repositories</PageHeader.ParentLink>
  </PageHeader.ContextArea>
  <PageHeader.TitleArea>
    <PageHeader.LeadingVisual><GitBranchIcon /></PageHeader.LeadingVisual>
    <PageHeader.Title as="h2">my-repo</PageHeader.Title>
    <PageHeader.Actions>
      <Button variant="primary">New file</Button>
    </PageHeader.Actions>
  </PageHeader.TitleArea>
</PageHeader>
```

Subcomponents: PageHeader.ContextArea, PageHeader.ParentLink, PageHeader.TitleArea, PageHeader.LeadingAction, PageHeader.LeadingVisual, PageHeader.Title, PageHeader.TrailingVisual, PageHeader.TrailingAction, PageHeader.Actions, PageHeader.Description, PageHeader.Navigation

#### Stack
Flexbox layout primitive.

```tsx
import {Stack} from '@primer/react'

<Stack direction="horizontal" gap="normal" align="center" justify="space-between">
  <Stack.Item grow>Content</Stack.Item>
  <Stack.Item>Side</Stack.Item>
</Stack>

<Stack direction="vertical" gap="condensed" padding="normal">
  <div>Item 1</div>
  <div>Item 2</div>
</Stack>
```

Props:
- `direction`: 'horizontal' | 'vertical' | ResponsiveValue
- `gap`: 'none' | 'condensed' | 'normal' | 'spacious' | ResponsiveValue
- `align`: 'stretch' | 'start' | 'center' | 'end' | 'baseline' | ResponsiveValue
- `justify`: 'start' | 'center' | 'end' | 'space-between' | 'space-evenly' | ResponsiveValue
- `wrap`: 'wrap' | 'nowrap' | ResponsiveValue
- `padding`: PaddingScale | ResponsiveValue

---

### Data Display

#### DataTable
Import from `@primer/react/experimental`:

```tsx
import {DataTable, Table} from '@primer/react/experimental'

<DataTable
  data={repos}
  columns={[
    {header: 'Repository', field: 'name', rowHeader: true},
    {header: 'Type', field: 'type', renderCell: (row) => <Label>{row.type}</Label>},
    {header: 'Updated', field: 'updatedAt', renderCell: (row) => <RelativeTime date={new Date(row.updatedAt)} />},
    {header: 'Stars', field: 'stars', align: 'end'},
  ]}
/>
```

Also exports: `Table`, `Table.Head`, `Table.Body`, `Table.Row`, `Table.Header`, `Table.Cell`, `Table.Container`, `Table.Title`, `Table.Subtitle`, `Table.Actions`, `createColumnHelper`

#### TreeView
File tree or hierarchical data display.

```tsx
import {TreeView} from '@primer/react'

<TreeView aria-label="Files">
  <TreeView.Item id="src" defaultExpanded>
    <TreeView.LeadingVisual><TreeView.DirectoryIcon /></TreeView.LeadingVisual>
    src
    <TreeView.SubTree>
      <TreeView.Item id="src/index.ts">
        <TreeView.LeadingVisual><FileIcon /></TreeView.LeadingVisual>
        index.ts
      </TreeView.Item>
    </TreeView.SubTree>
  </TreeView.Item>
</TreeView>
```

TreeView props: `flat`, `truncate` (default true)
TreeView.Item props: `id` (required), `defaultExpanded`, `expanded` (controlled), `onExpandedChange`, `onSelect`, `current` (boolean)
Subcomponents: TreeView.Item, TreeView.SubTree, TreeView.LeadingVisual, TreeView.TrailingVisual, TreeView.LeadingAction, TreeView.DirectoryIcon, TreeView.ErrorDialog

Supports async loading pattern with `TreeView.SubTree state="loading"`.

#### Timeline
Vertical timeline of events.

```tsx
import Timeline from '@primer/react'

<Timeline>
  <Timeline.Item>
    <Timeline.Badge><FlameIcon /></Timeline.Badge>
    <Timeline.Body>Created the repository</Timeline.Body>
  </Timeline.Item>
  <Timeline.Break />
  <Timeline.Item condensed>
    <Timeline.Badge><GitCommitIcon /></Timeline.Badge>
    <Timeline.Body>Pushed 3 commits</Timeline.Body>
  </Timeline.Item>
</Timeline>
```

Props: `clipSidebar` on Timeline; `condensed` on Timeline.Item
Subcomponents: Timeline.Item, Timeline.Badge, Timeline.Body, Timeline.Break

#### RelativeTime
```tsx
import RelativeTime from '@primer/react'

<RelativeTime datetime="2024-01-15T12:00:00Z" />
// Renders: "3 months ago" (auto-updating)
```

Props: `datetime` (string | Date), `noTitle`, `tense` ('past' | 'future'), `format`, `precision`

---

### Status and Feedback

#### Banner
Page-level or section-level alert banners.

```tsx
import {Banner} from '@primer/react'

<Banner variant="critical" title="Action required" onDismiss={() => {}}>
  Two-factor authentication is now required for all users.
</Banner>

<Banner variant="warning" title="Heads up" description="Your trial expires in 3 days." />
<Banner variant="success" title="Done!" />
<Banner variant="info" title="Tip" />
<Banner variant="upsell" title="Upgrade available" />
```

Props:
- `variant`: 'critical' | 'info' | 'success' | 'upsell' | 'warning'
- `title`: React.ReactNode
- `description`: React.ReactNode
- `onDismiss`: () => void (shows dismiss button)
- `primaryAction`, `secondaryAction`: React.ReactNode
- `layout`: 'default' | 'compact'
- `hideTitle`: boolean
- `flush`: boolean

#### InlineMessage
Inline contextual message (import from `@primer/react/experimental`).

```tsx
import {InlineMessage} from '@primer/react/experimental'

<InlineMessage variant="warning">This field is required</InlineMessage>
```

Props: `variant` ('critical' | 'success' | 'unavailable' | 'warning'), `size` ('small' | 'medium')

#### Flash
Simple alert messages.

```tsx
import Flash from '@primer/react'

<Flash variant="success">Item saved successfully!</Flash>
<Flash variant="danger">Something went wrong</Flash>
<Flash variant="warning">Proceed with caution</Flash>
```

Props: `variant` ('default' | 'warning' | 'success' | 'danger'), `full` (boolean)

#### Spinner
```tsx
import Spinner from '@primer/react'

<Spinner size="medium" />
<Spinner size="large" srText="Loading data..." />
```

Props: `size` ('small' | 'medium' | 'large'), `srText` (string | null, default 'Loading')

#### ProgressBar
```tsx
import {ProgressBar} from '@primer/react'

// Single bar
<ProgressBar progress={75} aria-label="Upload progress" barSize="default" />

// Stacked/segmented
<ProgressBar aria-label="Language breakdown" barSize="small">
  <ProgressBar.Item progress={60} sx={{bg: 'success.emphasis'}} />
  <ProgressBar.Item progress={25} sx={{bg: 'attention.emphasis'}} />
  <ProgressBar.Item progress={15} sx={{bg: 'danger.emphasis'}} />
</ProgressBar>
```

Props: `progress`, `barSize` ('small' | 'default' | 'large'), `animated`

#### StateLabel
GitHub-style issue/PR state labels.

```tsx
import StateLabel from '@primer/react'

<StateLabel status="issueOpened">Open</StateLabel>
<StateLabel status="issueClosed">Closed</StateLabel>
<StateLabel status="pullOpened">Open</StateLabel>
<StateLabel status="pullMerged">Merged</StateLabel>
<StateLabel status="draft">Draft</StateLabel>
```

Props: `status` ('issueOpened' | 'issueClosed' | 'issueClosedNotPlanned' | 'pullOpened' | 'pullClosed' | 'pullMerged' | 'draft' | 'unavailable'), `variant` ('small' | 'normal')

---

### Typography and Display

#### Heading
```tsx
import Heading from '@primer/react'

<Heading as="h1" variant="large">Page Title</Heading>
<Heading as="h2" variant="medium">Section Title</Heading>
<Heading as="h3" variant="small">Subsection</Heading>
```

Props: `as` ('h1' through 'h6', required), `variant` ('large' | 'medium' | 'small')

#### Text
```tsx
import Text from '@primer/react'

<Text size="large" weight="bold">Large bold text</Text>
<Text size="small" as="p">Small paragraph</Text>
```

Props: `as` (any element), `size` ('small' | 'medium' | 'large'), `weight` ('light' | 'normal' | 'semibold' | 'bold')

#### Truncate
```tsx
import Truncate from '@primer/react'

<Truncate title="This is a very long text that will be truncated" maxWidth={200}>
  This is a very long text that will be truncated
</Truncate>
```

Props: `title`, `inline`, `maxWidth`

#### Link
```tsx
import Link from '@primer/react'

<Link href="/page">Regular link</Link>
<Link href="/page" muted>Muted link</Link>
<Link href="/page" inline>Link within text</Link>
```

Props: `muted`, `inline`, `as` (polymorphic), plus standard anchor props

---

### Labels, Badges, and Tokens

#### Label
```tsx
import Label from '@primer/react'

<Label>Default</Label>
<Label variant="primary">Primary</Label>
<Label variant="success">Success</Label>
<Label variant="attention">Attention</Label>
<Label variant="danger">Danger</Label>
<Label variant="accent">Accent</Label>
<Label variant="sponsors" size="large">Sponsor</Label>
```

Props:
- `variant`: 'default' | 'primary' | 'secondary' | 'accent' | 'success' | 'attention' | 'severe' | 'danger' | 'done' | 'sponsors'
- `size`: 'small' | 'large'

#### LabelGroup
```tsx
import LabelGroup from '@primer/react'

<LabelGroup>
  <Label>Bug</Label>
  <Label variant="success">Enhancement</Label>
</LabelGroup>
```

#### CounterLabel
```tsx
import CounterLabel from '@primer/react'

<CounterLabel>12</CounterLabel>
<CounterLabel scheme="primary">99+</CounterLabel>
```

#### Token / IssueLabelToken
```tsx
import Token, {IssueLabelToken} from '@primer/react'

<Token text="React" onRemove={() => {}} />
<IssueLabelToken text="bug" fillColor="#d73a4a" />
```

Token props: `text`, `size` ('small' | 'medium' | 'large' | 'xlarge'), `onRemove`, `isSelected`, `leadingVisual`

#### CircleBadge
```tsx
import CircleBadge from '@primer/react'

<CircleBadge size={56}>
  <CircleBadge.Icon icon={ZapIcon} />
</CircleBadge>
```

#### TopicTag
Import from `@primer/react/experimental`:
```tsx
import {TopicTag} from '@primer/react/experimental'

<TopicTag as="a" href="/topics/react">react</TopicTag>
```

---

### Avatars

#### Avatar
```tsx
import Avatar from '@primer/react'

<Avatar src="https://github.com/octocat.png" size={40} alt="octocat" />
<Avatar src={url} square size={32} alt="org avatar" />
```

Props: `src` (required), `alt`, `size` (number | ResponsiveValue, default 20), `square` (boolean)

#### AvatarStack
```tsx
import AvatarStack from '@primer/react'

<AvatarStack>
  <Avatar alt="user1" src={url1} />
  <Avatar alt="user2" src={url2} />
  <Avatar alt="user3" src={url3} />
</AvatarStack>
```

Props: `size` (number | ResponsiveValue), `disableExpand`

---

### Skeleton / Loading States

Import from `@primer/react/experimental`:

```tsx
import {SkeletonBox, SkeletonText, SkeletonAvatar} from '@primer/react/experimental'

<SkeletonBox height="200px" />
<SkeletonText lines={3} />
<SkeletonAvatar size={40} />
<SkeletonAvatar size={40} square />
```

SkeletonBox props: `height`, `width`
SkeletonText props: `lines` (number), `maxWidth`
SkeletonAvatar props: `size`, `square`

---

### Miscellaneous

#### BranchName
```tsx
import BranchName from '@primer/react'

<BranchName as="a" href="/branch/main">main</BranchName>
```

#### Blankslate
Empty state placeholder. Import from `@primer/react/experimental`:

```tsx
import {Blankslate} from '@primer/react/experimental'

<Blankslate>
  <Blankslate.Visual><BookIcon size="medium" /></Blankslate.Visual>
  <Blankslate.Heading>No results found</Blankslate.Heading>
  <Blankslate.Description>Try a different search term</Blankslate.Description>
  <Blankslate.PrimaryAction href="/new">Create new item</Blankslate.PrimaryAction>
  <Blankslate.SecondaryAction href="/docs">Learn more</Blankslate.SecondaryAction>
</Blankslate>
```

#### Details
HTML details/summary with React state management.

```tsx
import Details from '@primer/react'

<Details>
  <Button as="summary">Click to expand</Button>
  <p>Hidden content</p>
</Details>
```

#### Portal
Renders children into a different DOM node.

```tsx
import Portal from '@primer/react'

<Portal>
  <div>This renders at document body</div>
</Portal>
```

#### VisuallyHidden
Visually hidden but accessible to screen readers.

```tsx
import {VisuallyHidden} from '@primer/react'

<VisuallyHidden>This text is only for screen readers</VisuallyHidden>
```

#### KeybindingHint
Display keyboard shortcut hints. Import from `@primer/react/experimental`:

```tsx
import {KeybindingHint} from '@primer/react/experimental'

<KeybindingHint keys="Mod+Shift+K" />
// Renders: ⌘ ⇧ K (on Mac) or Ctrl Shift K (on Windows)
```

#### ScrollableRegion
Accessible scrollable container. Import from `@primer/react/experimental`:

```tsx
import {ScrollableRegion} from '@primer/react/experimental'

<ScrollableRegion aria-label="Scrollable list">
  {longContent}
</ScrollableRegion>
```

---

### Accessibility / Live Regions

Import from `@primer/react/experimental`:

```tsx
import {AriaAlert, AriaStatus, Announce} from '@primer/react/experimental'

// Assertive announcement (screen reader interrupts)
<AriaAlert>Error: form submission failed</AriaAlert>

// Polite announcement (screen reader waits)
<AriaStatus>3 results found</AriaStatus>

// Base component with full control
<Announce politeness="polite" delayMs={500}>Updated</Announce>
```

---

## Responsive Design

### ResponsiveValue type

Many component props accept responsive values:

```tsx
type ResponsiveValue<T> = {
  narrow?: T   // < 768px
  regular?: T  // >= 768px
  wide?: T     // >= 1400px
}

// Example:
<Stack direction={{narrow: 'vertical', regular: 'horizontal'}} />
<Avatar size={{narrow: 20, regular: 40, wide: 64}} />
```

### Hidden component

Import from `@primer/react/experimental`:

```tsx
import {Hidden} from '@primer/react/experimental'

<Hidden when="narrow">Only visible on regular and wide screens</Hidden>
<Hidden when={['narrow', 'regular']}>Only visible on wide screens</Hidden>
```

Props: `when` ('narrow' | 'regular' | 'wide' | array of these)

### useResponsiveValue hook

```tsx
import {useResponsiveValue} from '@primer/react'

const columns = useResponsiveValue({narrow: 1, regular: 2, wide: 3}, 2)
```

---

## Hooks

All hooks are imported from `@primer/react`:

- `useTheme()` -- access current theme, color mode, and color scheme
- `useConfirm()` -- programmatic confirmation dialogs
- `useDetails()` -- details/summary element state
- `useSafeTimeout()` -- timeout with auto-cleanup on unmount
- `useOnOutsideClick(callback)` -- detect clicks outside an element
- `useOnEscapePress(callback)` -- detect escape key presses
- `useOpenAndCloseFocus(options)` -- manage focus when opening/closing overlays
- `useOverlay(options)` -- full overlay behavior (escape, outside click, focus)
- `useFocusTrap(options)` -- trap focus within an element
- `useFocusZone(options)` -- keyboard navigation within a zone (arrow keys)
- `useAnchoredPosition(options)` -- position element relative to anchor
- `useResizeObserver(callback)` -- observe element resizing
- `useResponsiveValue(values, fallback)` -- responsive value selection
- `useId()` -- generate unique IDs
- `useProvidedRefOrCreate(ref?)` -- use provided ref or create one
- `useRefObjectAsForwardedRef(ref, value)` -- sync ref object with forwarded ref
- `useIsomorphicLayoutEffect` -- SSR-safe useLayoutEffect
- `useFormControlForwardedProps()` -- access FormControl context in custom inputs

---

## Feature Flags

Import from `@primer/react/experimental`:

```tsx
import {FeatureFlags, useFeatureFlag} from '@primer/react/experimental'

<FeatureFlags flags={{primer_react_css_has_selector_perf: true}}>
  <App />
</FeatureFlags>

// In a component:
const isEnabled = useFeatureFlag('my_feature')
```

---

## Theme

### Theme object structure

```
theme.animation    -- easing functions
theme.breakpoints  -- ['544px', '768px', '1012px', '1280px']
theme.fonts.normal -- system font stack
theme.fonts.mono   -- monospace font stack
theme.fontSizes    -- ['12px', '14px', '16px', '20px', '24px', '32px', '40px', '48px', '56px']
theme.fontWeights  -- {light: 300, normal: 400, semibold: 500, bold: 600}
theme.lineHeights  -- {condensedUltra: 1, condensed: 1.25, default: 1.5}
theme.radii        -- ['0', '3px', '6px', '100px']
theme.space        -- ['0', '4px', '8px', '16px', '24px', '32px', '40px', '48px', '64px', '80px', '96px', '112px', '128px']
theme.sizes        -- {small: '544px', medium: '768px', large: '1012px', xlarge: '1280px'}
theme.colorSchemes -- day/night/light/dark color tokens
```

---

## Import Paths

| Path | Contents |
|------|----------|
| `@primer/react` | All stable components, hooks, and utilities |
| `@primer/react/experimental` | Experimental/draft components (DataTable, Blankslate, Hidden, InlineMessage, Skeleton*, KeybindingHint, TopicTag, IssueLabel, ScrollableRegion, UnderlinePanels, Tabs, FilteredActionList, FeatureFlags, live regions, Stack, SelectPanel2) |
| `@primer/react/deprecated` | Deprecated components (old ActionList, old ActionMenu, FilteredSearch, old UnderlineNav, old Dialog, Octicon wrapper, TabNav, old Tooltip, Pagehead) |
| `@primer/octicons-react` | Icon components (SearchIcon, GearIcon, etc.) |

---

## Key Patterns

1. Compound components: Many components use dot-notation subcomponents (ActionMenu.Button, Dialog.Header, TreeView.Item, etc.). Do not try to import subcomponents separately -- access them through the parent.

2. Polymorphic `as` prop: Many components accept `as` to change the rendered HTML element (e.g., `<Button as="a" href="...">` renders an anchor styled as button).

3. Controlled vs uncontrolled: Components like Dialog, ActionMenu, and TreeView support both patterns. Use `open`/`onOpenChange` for controlled, or let the component manage its own state.

4. Accessibility is built-in: Components handle ARIA attributes, focus management, and keyboard navigation. Provide `aria-label` where required (ActionBar, SegmentedControl, TreeView, IconButton).

5. All icons come from `@primer/octicons-react`. Never build custom SVG icons when an Octicon exists. Browse the full set at https://primer.style/foundations/icons.

# Primer Octicons Reference

## Install

```shell
npm install @primer/octicons-react
```

## Usage

### Icons

The `@primer/octicons-react` module exports individual icons as [named
exports](https://ponyfoo.com/articles/es6-modules-in-depth#named-exports). This
allows you to import only the icons that you need without blowing up your
bundle:

```jsx
import React from 'react'
import {BeakerIcon, ZapIcon} from '@primer/octicons-react'

export default function Icon({boom}) {
  return boom ? <ZapIcon /> : <BeakerIcon />
}
```

If you were to compile this example with a tool that supports [tree-shaking][]
(such as Webpack, Rollup, or Parcel) the resulting bundle would only include
the "zap" and "beaker" icons.

### Vertical alignment

By default the octicons have `vertical-align: text-bottom;` applied as inline
styles. You can change the alignment via the `verticalAlign` prop, which can be
either `middle`, `text-bottom`, `text-top`, or `top`.

```js
import {RepoIcon} from '@primer/octicons-react'

export default () => (
  <h1>
    <RepoIcon verticalAlign="middle" /> github/github
  </h1>
)
```

### `aria-label`

You have the option of adding accessibility information to the icon with the
[`aria-label` attribute][aria-label] via the `aria-label` prop.

```js
// Example usage
import {PlusIcon} from '@primer/octicons-react'

export default () => (
  <button>
    <PlusIcon aria-label="Add new item" /> New
  </button>
)
```

### `aria-labelledby`

You have the option of adding accessibility information to the icon with the
[`aria-labelledby` attribute][aria-labelledby] via the `aria-labelledby` prop. Using aria-labelledby referencing the id values of the title element provides the accessible name.

```js
// Example usage
import {PlusIcon} from '@primer/octicons-react'

export default () => (
  <button>
    <PlusIcon aria-labelledby="title" title="Add new item" /> New
  </button>
)
```

### `title`

You have the option of adding accessibility information to the icon with the
[`title` attribute][title] via the `title` prop.

### `id`

You have the option of adding information to the icon with the
[`id` attribute][id] via the `id` prop.

```js
// Example usage
import {PlusIcon} from '@primer/octicons-react'

export default () => (
  <button>
    <PlusIcon id="unique-plus-icon" /> New
  </button>
)
```

### `tabIndex`

You can add the `tabindex` attribute to an SVG element via the `tabIndex` prop if the SVG element is intended to be interactive.
`tabIndex` prop also controls the `focusable` attribute of the SVG element which is defined by SVG Tiny 1.2 and only implemented in
Internet Explorer and Microsoft Edge.

If there is no `tabIndex` prop is present (default behavior), it will set the `focusable` attribute to `false`. This is helpful
for preventing the decorative SVG from being announced by some specialized assistive technology browsing modes which can get delayed
while trying to parse the SVG markup.

```js
// Example usage
import {PlusIcon} from '@primer/octicons-react'
export default () => (
  <PlusIcon aria-label="Interactive Plus Icon" tabIndex={0} /> New Item
)
```

### Sizes

The `size` prop takes `small`, `medium`, and `large` values that can be used to
render octicons at standard sizes:

| Prop            | Rendered Size                   |
| :-------------- | :------------------------------ |
| `size='small'`  | 16px height by `computed` width |
| `size='medium'` | 32px height by `computed` width |
| `size='large'`  | 64px height by `computed` width |

```js
// Example usage
import {LogoGithubIcon} from '@primer/octicons-react'

export default () => (
  <h1>
    <a href="https://github.com">
      <LogoGithubIcon size="large" aria-label="GitHub" />
    </a>
  </h1>
)
```

### Fill

The `fill` prop takes a string value that can be used to set the color of the icon.
By default, `fill` is set to [`currentColor`](https://css-tricks.com/currentcolor/).

```js
// Example usage
import {LogoGithub} from '@primer/octicons-react'
export default () => (
  <h1>
    <a href="https://github.com">
      <LogoGithubIcon fill="#f00" />
    </a>
  </h1>
)
```
