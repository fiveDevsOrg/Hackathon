import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  ChevronsUpDown,
  CircleCheck,
  Database,
  FileJson,
  GitBranch,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Settings as SettingsLucide,
  Trash2,
  Webhook,
} from "lucide-react";
import ComponentFileViewer from "./components/ui/file-viewer.jsx";
import RotatingEarth from "./components/RotatingEarth.jsx";
import { GlassButton, ZapIcon } from "@/components/ui/glass-button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import Loader from "@/components/ui/loader";
import OutputFileBrowser from "@/components/ui/output-file-browser";
import { AlertToastViewport } from "@/components/ui/alert-toast";
import { AtlasScrollArea } from "@/components/ui/atlas-scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import ScrollProgressBar from "@/components/ui/scroll-progress-bar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "atlas_world_model_v0";
const LEGACY_STORAGE_KEY = ["jar", "vis_world_model_v0"].join("");
const AGENT_REPORTS_KEY = "atlas_agent_report_inbox_v1";
const REGISTERED_AGENTS_KEY = "atlas_registered_agents_v1";

const emptyWorld = {
  entities: [],
  relationships: [],
  events: [],
};

const sampleInput =
  "Met with my boss today. Finance wants a new cost allocation report. Azure Cost Analysis is delayed until the DBA responds.";

const ENTITY_TYPES = [
  "Person",
  "Team",
  "Organization",
  "Workflow",
  "Stage",
  "Output",
  "Project",
  "Goal",
  "Asset",
  "WorkItem",
  "Task",
  "Action",
  "AgentRun",
  "System",
  "Application",
  "DataSource",
  "Dataset",
  "Report",
  "Dashboard",
  "Process",
  "Concept",
  "Artifact",
  "Agent",
  "Event",
  "Relationship",
  "Edge",
  "EntityExtraction",
  "InternalGraphObject",
  "Unknown",
];

const EVENT_TYPES = [
  "MeetingHeld",
  "FeedbackReceived",
  "RequestMade",
  "ChangeNeeded",
  "MeetingNeeded",
  "DependencyIdentified",
  "BlockerIdentified",
  "StatusChanged",
  "DecisionMentioned",
  "InformationLearned",
  "AgentReport",
  "TaskCompleted",
  "ArtifactChanged",
  "WorkflowUpdated",
];

const CANONICAL_WORKFLOW_STATES = [
  "Queued",
  "Assigned",
  "In Progress",
  "Blocked",
  "Needs Review",
  "Revision Requested",
  "Approved",
  "Completed",
  "Failed",
  "Canceled",
];

const CANONICAL_WORKFLOW_SEQUENCE = [
  "Queued",
  "Assigned",
  "In Progress",
  "Needs Review",
  "Approved",
  "Completed",
];

const navItems = [
  { id: "state", label: "Workflows", icon: LayoutDashboard },
  { id: "agents", label: "Agents", icon: Bot },
];

const PRODUCT_NAME = "Atlas";

const sidebarVariants = {
  open: { width: "15rem" },
  closed: { width: "3.05rem" },
};

const sidebarContentVariants = {
  open: { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const sidebarItemVariants = {
  open: {
    x: 0,
    opacity: 1,
    transition: {
      x: { stiffness: 1000, velocity: -100 },
    },
  },
  closed: {
    x: -20,
    opacity: 0,
    transition: {
      x: { stiffness: 100 },
    },
  },
};

const sidebarTransition = {
  type: "tween",
  ease: "easeOut",
  duration: 0.2,
  staggerChildren: 0.1,
};

const sidebarStaggerVariants = {
  open: {
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

function App() {
  const isLoading = useDelayedGlobalFetchLoading();

  return (
    <AppErrorBoundary>
      <AtlasWorldModel />
      {/* Landing gate disabled for now.
      <AtlasLandingView onEnter={() => setHasEntered(true)} />
      */}
      <GlobalLoadingOverlay visible={isLoading} />
    </AppErrorBoundary>
  );
}

function useDelayedGlobalFetchLoading(delay = 450) {
  const [pendingCount, setPendingCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.fetch !== "function") {
      return undefined;
    }

    const originalFetch = window.fetch.bind(window);
    let mounted = true;

    window.fetch = async (...args) => {
      if (mounted) setPendingCount((count) => count + 1);
      try {
        return await originalFetch(...args);
      } finally {
        if (mounted) setPendingCount((count) => Math.max(0, count - 1));
      }
    };

    return () => {
      mounted = false;
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (pendingCount <= 0) {
      setVisible(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay, pendingCount]);

  return visible && pendingCount > 0;
}

function GlobalLoadingOverlay({ visible }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/72 backdrop-blur-sm" role="status" aria-live="polite" aria-label="Loading">
      <Loader />
    </div>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen place-items-center bg-zinc-50 p-6 text-zinc-950">
          <section className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">{PRODUCT_NAME}</h1>
            <p className="mt-2 text-sm text-zinc-500">{this.state.error.message || "The world model could not load."}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function AtlasWorldModel() {
  const [activeView, setActiveView] = useState("home");
  const [input, setInput] = useState(sampleInput);
  const [query, setQuery] = useState("What happened today?");
  const [world, setWorld] = useState(loadWorld);
  const [agentReports, setAgentReports] = useState(loadAgentReports);
  const [agentStatus, setAgentStatus] = useState({ configured: false, recentCount: 0, lastReceivedAt: "" });
  const [lastExtraction, setLastExtraction] = useState(null);
  const [queryAnswer, setQueryAnswer] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [selectedObjectName, setSelectedObjectName] = useState("");
  const [selectedObjectRoot, setSelectedObjectRoot] = useState("");
  const [toasts, setToasts] = useState([]);

  const operationalState = useMemo(() => getOperationalState(world, lastExtraction), [world, lastExtraction]);

  useEffect(() => {
    let cancelled = false;

    async function syncAgentReports() {
      try {
        const response = await fetch("/api/report");
        if (!response.ok) {
          return;
        }
        const payload = await parseApiJson(response);
        if (cancelled) {
          return;
        }
        const reports = Array.isArray(payload.reports) ? payload.reports : [];
        const currentReports = loadAgentReports();
        const known = new Set(currentReports.map((report) => report.id));
        const incoming = reports
          .filter((report) => report.id && !known.has(report.id) && report.processing_result?.extraction)
          .sort((left, right) => Date.parse(left.timestamp || left.received_at || "") - Date.parse(right.timestamp || right.received_at || ""));
        setAgentStatus({
          configured: Boolean(payload.api_key_configured),
          recentCount: reports.length,
          lastReceivedAt: payload.last_report_received_at || "",
        });
        if (!incoming.length) {
          return;
        }
        let nextWorld = loadWorld();
        for (const report of incoming) {
          nextWorld = mergeWorld(nextWorld, report.processing_result.extraction);
        }
        const nextReports = dedupeReports([...currentReports, ...incoming]);
        setWorld(nextWorld);
        saveWorld(nextWorld);
        setAgentReports(nextReports);
        saveAgentReports(nextReports);
        setLastExtraction(incoming.at(-1).processing_result.extraction);
      } catch {
        // Agent reporting is optional for local manual use.
      }
    }

    syncAgentReports();
    const interval = setInterval(syncAgentReports, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleCapture(inputOverride) {
    const rawInput = String(inputOverride ?? input).trim();

    if (!rawInput) {
      setError("Tell Atlas what changed first.");
      return;
    }

    setStatus("extracting");
    setError("");

    try {
      const workflowContext = workflowContextFromInput(rawInput);
      let extraction;
      try {
        extraction = await extractWorldUpdate(rawInput);
      } catch (extractError) {
        if (!workflowContext) {
          throw extractError;
        }
        extraction = {
          entities: [],
          relationships: [],
          events: [],
          extractor: {
            mode: "workflow_command",
            provider: "Atlas",
            model: "deterministic_workflow_update",
          },
        };
      }
      const sourcedExtraction = augmentWorkflowManualUpdate(withUpdateSource(extraction, {
        source: "manual",
        submitted_by: "user",
      }), rawInput, world);
      const nextWorld = mergeWorld(world, sourcedExtraction);
      setWorld(nextWorld);
      saveWorld(nextWorld);
      setLastExtraction(sourcedExtraction);
      setActiveView("state");
      setInput("");
    } catch (captureError) {
      setError(captureError.message || "Atlas could not process the update.");
    } finally {
      setStatus("idle");
    }
  }

  async function handleWorkflowCommand(command) {
    setStatus("extracting");
    setError("");
    const localExtraction = withUpdateSource(command.extraction, {
      source: "manual",
      submitted_by: "user",
    });
    let sourcedExtraction = localExtraction;

    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command.report),
      });
      const payload = await parseApiJson(response);
      if (!response.ok) {
        throw new Error(payload.error || "Workflow update API failed.");
      }
      if (payload.extraction) {
        sourcedExtraction = withUpdateSource(payload.extraction, {
          source: "manual",
          submitted_by: "user",
          report_id: payload.report_id,
        });
      }
      if (payload.report) {
        const nextReports = dedupeReports([...loadAgentReports(), payload.report]);
        setAgentReports(nextReports);
        saveAgentReports(nextReports);
      }
    } catch (workflowError) {
      setError(`${workflowError.message || "Atlas could not persist the workflow update."} Saved locally for this browser.`);
    } finally {
      let nextWorld = mergeWorld(loadWorld(), sourcedExtraction);
      if (sourcedExtraction !== localExtraction) {
        nextWorld = mergeWorld(nextWorld, refreshExtractionTimestamps(localExtraction));
      }
      setWorld(nextWorld);
      saveWorld(nextWorld);
      setLastExtraction(sourcedExtraction);
      if (!command.stayOnCurrentView) {
        setActiveView("state");
      }
      setInput("");
      setStatus("idle");
    }
  }

  function handleQuery() {
    setQueryAnswer(answerQuery(query, world));
    setActiveView("timeline");
  }

  function handleOpenObject(name, options = {}) {
    if (!name) {
      return;
    }

    setSelectedObjectName(resolveObjectSelectionName(name, world));
    setSelectedObjectRoot(options.root || "");
    setActiveView("object");
  }

  async function handleCreateWorkflowFromAgent(agent) {
    const extraction = workflowFromAgentExtraction(agent);
    const creationEvent = extraction.events[0] || {};
    const workflow = creationEvent.details?.workflow;
    const workflowName = workflow?.name || creationEvent.details?.workflow_name;
    const summary = creationEvent.details?.summary || `${workflowName || "Agent workflow"} created.`;
    let sourcedExtraction = extraction;
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          submitted_by: "user",
          project: workflowName || agent.default_project || "Atlas",
          message: summary,
          status: workflow?.stage_status || workflow?.stage || "Queued",
          workflow,
          outputs: workflow?.outputs || [],
          events: [
            {
              type: "WorkflowUpdated",
              target: workflowName,
              summary,
            },
          ],
          timestamp: creationEvent.timestamp || new Date().toISOString(),
        }),
      });
      const payload = await parseApiJson(response);
      if (!response.ok) {
        throw new Error(payload.error || "Workflow creation API failed.");
      }
      if (payload.extraction) {
        sourcedExtraction = withUpdateSource(payload.extraction, {
          source: "manual",
          submitted_by: "user",
          report_id: payload.report_id,
        });
      }
      if (payload.report) {
        const nextReports = dedupeReports([...loadAgentReports(), payload.report]);
        setAgentReports(nextReports);
        saveAgentReports(nextReports);
      }
    } catch (createError) {
      setError(`${createError.message || "Atlas could not persist the workflow creation."} Saved locally for this browser.`);
    }

    let nextWorld = mergeWorld(loadWorld(), sourcedExtraction);
    if (sourcedExtraction !== extraction) {
      nextWorld = mergeWorld(nextWorld, refreshExtractionTimestamps(extraction));
    }
    setWorld(nextWorld);
    saveWorld(nextWorld);
    setLastExtraction(sourcedExtraction);
    if (workflowName) {
      setSelectedObjectName(workflowName);
      setSelectedObjectRoot("");
      setActiveView("object");
    } else {
      setActiveView("state");
    }
    notifyToast({
      variant: "success",
      title: "Workflow created",
      description: `${workflowName || "Agent workflow"} is ready to run.`,
    });
  }

  function handleReset() {
    setWorld(emptyWorld);
    saveWorld(emptyWorld);
    setLastExtraction(null);
    setAgentReports([]);
    saveAgentReports([]);
    setQueryAnswer("");
    setError("");
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeWorld(JSON.parse(String(reader.result || "{}")));
        setWorld(imported);
        saveWorld(imported);
        setActiveView("state");
        setError("");
      } catch {
        setError("That file is not a valid world_model.json.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function notifyToast(toast) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { id, variant: "info", ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5200);
  }

  function closeToast(id) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  return (
    <>
      <AppShell
        activeView={activeView}
        error={error}
        input={input}
        lastExtraction={lastExtraction}
        onCapture={handleCapture}
        onImport={handleImport}
        onInputChange={setInput}
        onCreateWorkflowFromAgent={handleCreateWorkflowFromAgent}
        onOpenObject={handleOpenObject}
        onToast={notifyToast}
        onWorkflowCommand={handleWorkflowCommand}
        onQuery={handleQuery}
        onQueryChange={setQuery}
        onReset={handleReset}
        query={query}
        queryAnswer={queryAnswer}
        selectedObjectName={selectedObjectName}
        selectedObjectRoot={selectedObjectRoot}
        setActiveView={setActiveView}
        operationalState={operationalState}
        status={status}
        world={world}
        agentReports={agentReports}
        agentStatus={agentStatus}
      />
      <ScrollProgressBar type="bar" orientation="vertical" position="right" color="#18181b" strokeSize={3} />
      <AlertToastViewport toasts={toasts} onClose={closeToast} />
    </>
  );
}

function AppShell(props) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-950"
      style={{ "--atlas-sidebar-width": sidebarExpanded ? "15rem" : "3.05rem" }}
    >
      <Sidebar activeView={props.activeView} expanded={sidebarExpanded} setActiveView={props.setActiveView} setExpanded={setSidebarExpanded} />
      <main className="min-w-0 overflow-x-hidden transition-[margin-left] duration-200 ease-out lg:ml-[var(--atlas-sidebar-width)]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-6">
          {props.activeView === "dashboard" && <DashboardView {...props} />}
          {props.activeView === "state" && <ObjectDirectory onOpenObject={props.onOpenObject} world={props.world} />}
          {props.activeView === "agents" && <AgentsView onOpenObject={props.onOpenObject} />}
          {props.activeView === "object" && (
            getObjectDetail(props.selectedObjectName, props.world, props.selectedObjectRoot).type === "Workflow"
              ? <WorkflowDetailView workflow={getWorkflowDetail(props.selectedObjectName, props.world)} onOpenObject={props.onOpenObject} onOpenWorkflows={() => props.setActiveView("state")} onToast={props.onToast} onWorkflowCommand={props.onWorkflowCommand} world={props.world} />
              : <ObjectDetailView object={getObjectDetail(props.selectedObjectName, props.world, props.selectedObjectRoot)} onCreateWorkflowFromAgent={props.onCreateWorkflowFromAgent} onDeleteRegisteredAgent={deleteRegisteredAgent} onOpenAgents={() => props.setActiveView("agents")} onOpenObject={props.onOpenObject} registryActionsEnabled={props.selectedObjectRoot === "agents"} />
          )}
          {props.activeView === "entities" && (
            <RecordsView title="Entities" description="Durable things Atlas has observed." rows={props.world.entities} renderRow={renderEntityCard} />
          )}
          {props.activeView === "relationships" && (
            <RecordsView
              title="Relationships"
              description="Canonical connections between entities."
              rows={props.world.relationships}
              renderRow={renderRelationshipCard}
            />
          )}
          {props.activeView === "events" && (
            <RecordsView title="Events" description="Things that happened or changed." rows={props.world.events} renderRow={renderEventCard} />
          )}
          {props.activeView === "timeline" && (
            <TimelineView query={props.query} queryAnswer={props.queryAnswer} onQuery={props.onQuery} onQueryChange={props.onQueryChange} world={props.world} />
          )}
          {props.activeView === "settings" && <SettingsView agentStatus={props.agentStatus} onImport={props.onImport} onReset={props.onReset} world={props.world} />}
        </div>
      </main>
    </div>
  );
}

function Sidebar({ activeView, expanded, setActiveView, setExpanded }) {
  return (
    <motion.aside
      animate={expanded ? "open" : "closed"}
      className="sidebar fixed left-0 top-0 z-40 hidden h-screen shrink-0 overflow-hidden border-r border-zinc-200 bg-white text-zinc-500 lg:block"
      initial={expanded ? "open" : "closed"}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      transition={sidebarTransition}
      variants={sidebarVariants}
    >
      <motion.div className="relative z-40 flex h-full shrink-0 flex-col bg-white transition-all" variants={sidebarContentVariants}>
        <motion.ul className="flex h-full flex-col" variants={sidebarStaggerVariants}>
          <div className="flex grow flex-col items-center">
            <div className="flex h-full w-full flex-col">
              <div className="flex min-h-0 grow flex-col gap-4">
                <AtlasScrollArea className="min-h-0 grow" viewportClassName="p-2 pt-3">
                  <div className="flex w-full flex-col gap-1">
                    {navItems.map((item) => (
                      <SidebarNavButton
                        active={activeView === item.id || (item.id === "state" && activeView === "object")}
                        expanded={expanded}
                        icon={item.icon}
                        key={item.id}
                        label={item.label}
                        onClick={() => setActiveView(item.id)}
                      />
                    ))}
                  </div>
                </AtlasScrollArea>
              </div>

              <div className="flex flex-col gap-1 border-t border-zinc-200 p-2">
                <SidebarNavButton
                  active={activeView === "settings"}
                  expanded={expanded}
                  icon={SettingsLucide}
                  label="Settings"
                  onClick={() => setActiveView("settings")}
                />
                <button
                  className={cn(
                    "flex h-8 w-full items-center rounded-md px-2 py-1.5 text-left transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300",
                    expanded ? "gap-2" : "justify-center"
                  )}
                  type="button"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-zinc-100 text-[9px] font-semibold text-zinc-700 ring-1 ring-zinc-200">A</span>
                  <motion.li className="flex min-w-0 flex-1 items-center gap-2" variants={sidebarItemVariants}>
                    {expanded && (
                      <>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-950">Account</p>
                          <p className="truncate text-[11px] text-zinc-500">Local operator</p>
                        </div>
                        <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-zinc-400" />
                      </>
                    )}
                  </motion.li>
                </button>
              </div>
            </div>
          </div>
        </motion.ul>
      </motion.div>
    </motion.aside>
  );
}

function SidebarNavButton({ active, expanded, icon: Icon, label, onClick }) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 text-left transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300",
        expanded ? "gap-2" : "justify-center",
        active && "bg-zinc-100 text-blue-600"
      )}
      onClick={onClick}
      title={!expanded ? label : undefined}
      type="button"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <motion.li className="min-w-0" variants={sidebarItemVariants}>
        {expanded && <p className="ml-2 truncate text-sm font-medium">{label}</p>}
      </motion.li>
    </button>
  );
}

function AtlasLandingView({ onEnter }) {
  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEnter();
    }
  }

  return (
    <main
      aria-label="Enter Atlas"
      className="min-h-screen cursor-pointer bg-black px-6 outline-none sm:px-10 lg:px-14"
      onClick={onEnter}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <section className="mx-auto grid min-h-screen w-full max-w-[1180px] items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)]">
        <h1
          className="justify-self-start text-left text-[clamp(1.85rem,4.1vw,4.35rem)] font-semibold leading-[1] tracking-[-0.04em] text-transparent"
          style={{ WebkitTextStroke: "1.35px rgba(255,255,255,0.92)" }}
        >
          <span className="block whitespace-nowrap">Welcome to Atlas,</span>
          <span className="mt-2.5 flex items-baseline gap-x-4">
            <span className="shrink-0 whitespace-nowrap">where</span>
            <span
              className="inline-block min-h-[1em] w-[min(72vw,11.4em)] text-left text-transparent"
              style={{ WebkitTextStroke: "1.2px rgba(161,161,170,0.92)" }}
            >
              <Typewriter
                text={["Agents execute.", "Atlas organizes.", "Operators decide."]}
                speed={46}
                deleteSpeed={24}
                waitTime={1700}
                cursorClassName="ml-1 text-transparent"
                cursorStyle={{ WebkitTextStroke: "1.2px rgba(161,161,170,0.8)" }}
              />
            </span>
          </span>
        </h1>
        <RotatingEarth width={470} height={360} className="hidden justify-self-end lg:block" />
      </section>
    </main>
  );
}

function Typewriter({
  text,
  speed = 50,
  initialDelay = 0,
  waitTime = 2000,
  deleteSpeed = 30,
  loop = true,
  className = "",
  showCursor = true,
  hideCursorOnType = false,
  cursorChar = "|",
  cursorClassName = "ml-1",
  cursorStyle,
  cursorAnimationVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        duration: 0.01,
        repeat: Infinity,
        repeatDelay: 0.4,
        repeatType: "reverse",
      },
    },
  },
}) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const texts = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);

  useEffect(() => {
    let timeout;
    const currentText = texts[currentTextIndex] || "";

    const startTyping = () => {
      if (isDeleting) {
        if (displayText === "") {
          setIsDeleting(false);
          if (currentTextIndex === texts.length - 1 && !loop) {
            return;
          }
          setCurrentTextIndex((prev) => (prev + 1) % texts.length);
          setCurrentIndex(0);
        } else {
          timeout = setTimeout(() => {
            setDisplayText((prev) => prev.slice(0, -1));
          }, deleteSpeed);
        }
      } else if (currentIndex < currentText.length) {
        timeout = setTimeout(() => {
          setDisplayText((prev) => prev + currentText[currentIndex]);
          setCurrentIndex((prev) => prev + 1);
        }, speed);
      } else if (texts.length > 1) {
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, waitTime);
      }
    };

    if (currentIndex === 0 && !isDeleting && displayText === "") {
      timeout = setTimeout(startTyping, initialDelay);
    } else {
      startTyping();
    }

    return () => clearTimeout(timeout);
  }, [currentIndex, displayText, isDeleting, speed, deleteSpeed, waitTime, texts, currentTextIndex, loop, initialDelay]);

  return (
    <span className={`inline whitespace-pre-wrap tracking-tight ${className}`}>
      <span>{displayText}</span>
      {showCursor && (
        <motion.span
          animate="animate"
          className={cn(
            cursorClassName,
            hideCursorOnType && (currentIndex < (texts[currentTextIndex] || "").length || isDeleting) ? "hidden" : ""
          )}
          initial="initial"
          style={cursorStyle}
          variants={cursorAnimationVariants}
        >
          {cursorChar}
        </motion.span>
      )}
    </span>
  );
}

function DashboardView({ error, input, lastExtraction, onCapture, onInputChange, onWorkflowCommand, status, world }) {
  return (
    <div className="grid gap-5">
      <WorldModelInput error={error} input={input} isUpdating={status === "extracting"} lastExtraction={lastExtraction} onCapture={onCapture} onInputChange={onInputChange} onWorkflowCommand={onWorkflowCommand} world={world} />
    </div>
  );
}

function WorldModelInput({ error, input, isUpdating, lastExtraction, onCapture, onInputChange, onWorkflowCommand, world }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [commandError, setCommandError] = useState("");
  const canSubmit = input.trim().length > 0 && !isUpdating;
  const workflows = useMemo(() => getWorkflowCards(world || emptyWorld), [world]);
  const inlineWorkflow = useMemo(() => parseWorkflowCommandInput(input, workflows), [input, workflows]);
  const workflowCommandLike = selectedWorkflow || /^\/workflow\b/i.test(input.trim()) || /\b(next stage|next step|move forward|advance)\b/i.test(input);
  const resolvedWorkflow = selectedWorkflow || inlineWorkflow?.workflow || inferWorkflowFromUpdateText(input, workflows) || (workflows.length === 1 ? workflows[0] : null);
  const updateText = inlineWorkflow?.update || input.replace(/^\/workflow\s*,?\s*/i, "");
  const commandMatch = input.match(/(^|\s)\/workflow(?:\s+([^/]*))?$/i);
  const workflowQuery = String(commandMatch?.[2] || "").trim().toLowerCase();
  const showWorkflowCommand = Boolean(commandMatch);
  const visibleWorkflows = workflows
    .filter((workflow) => !workflowQuery || workflow.name.toLowerCase().includes(workflowQuery) || workflow.status.toLowerCase().includes(workflowQuery))
    .slice(0, 6);

  async function submitUpdate() {
    const workflowContext = resolvedWorkflow;
    if (workflowCommandLike && !workflowContext) {
      setCommandError("Select a workflow first. Atlas needs a target before it can move to the next stage.");
      return;
    }
    setCommandError("");
    if (workflowContext) {
      const intent = await resolveWorkflowCommandIntent({
        rawInput: input,
        updateText,
        workflow: workflowContext,
        workflows,
      });
      await onWorkflowCommand(buildWorkflowCommandPayload({
        workflow: workflowContext,
        intent,
        updateText,
        world,
      }));
    } else {
      await onCapture(input);
    }
    if (input.trim()) {
      setSelectedWorkflow(null);
    }
  }

  function insertWorkflowCommand(workflow) {
    const prefix = input.replace(/(^|\s)\/workflow(?:\s+[^/]*)?$/i, "$1").trimEnd();
    setSelectedWorkflow(workflow);
    setCommandError("");
    onInputChange(prefix);
  }

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[32px] font-semibold tracking-[-0.035em] text-zinc-950">Welcome to Atlas.</h2>
          <p className="mt-1 text-sm text-zinc-500">Your agentic orchestration control center.</p>
        </div>
        {lastExtraction?.extractor && (
          <div className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-xs text-zinc-500">
            {lastExtraction.extractor.provider || lastExtraction.extractor.mode} · {lastExtraction.extractor.model || "model"}
          </div>
        )}
      </div>
      <div className={`relative overflow-visible rounded-[28px] bg-white p-2 shadow-[0_18px_60px_rgba(24,24,27,0.08)] ring-1 transition ${isUpdating ? "ring-zinc-400" : "ring-zinc-200 focus-within:ring-zinc-400"}`}>
        <div className="flex min-h-[112px] flex-wrap items-start gap-2 rounded-[22px] bg-zinc-50/80 px-3 py-3">
          {selectedWorkflow && (
            <div className="mt-1 inline-flex max-w-full shrink-0 items-center gap-2 rounded-full bg-white px-2.5 py-1.5 text-sm shadow-sm ring-1 ring-zinc-200">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-950 text-white">
                <WorkflowIcon name="branch" className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-medium text-zinc-950">{selectedWorkflow.name}</span>
              <button
                className="ml-1 rounded-full px-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                type="button"
                aria-label="Remove workflow context"
                onClick={() => setSelectedWorkflow(null)}
              >
                x
              </button>
            </div>
          )}
          <textarea
            className="max-h-[180px] min-h-[88px] min-w-[240px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-7 text-zinc-950 outline-none placeholder:text-zinc-400"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSubmit) submitUpdate();
              }
            }}
            placeholder={selectedWorkflow ? "Write the workflow update..." : "Log what changed..."}
          />
          {commandError && (
            <div className="mt-auto w-full rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              {commandError}
            </div>
          )}
        </div>
        {showWorkflowCommand && (
          <div className="absolute left-5 right-5 top-[86px] z-50 overflow-hidden rounded-2xl bg-white p-1 shadow-2xl ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-zinc-950">Workflow command</div>
                <div className="text-[11px] text-zinc-500">Select a workflow to update its state.</div>
              </div>
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">/workflow</span>
            </div>
            <AtlasScrollArea className="max-h-72" viewportClassName="p-1">
              {visibleWorkflows.length ? visibleWorkflows.map((workflow) => (
                <button
                  className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  key={workflow.name}
                  type="button"
                  onClick={() => insertWorkflowCommand(workflow)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-950">{workflow.name}</div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-zinc-500">
                      <span className="truncate">{workflow.currentStage || "No active stage"}</span>
                      <span className="text-zinc-300">·</span>
                      <span className="truncate">{workflow.status}</span>
                    </div>
                  </div>
                  <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                </button>
              )) : (
                <div className="px-3 py-4 text-sm text-zinc-500">No workflows found.</div>
              )}
            </AtlasScrollArea>
          </div>
        )}
        <div className="flex flex-col gap-2 px-1 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <ActivityIndicator isUpdating={isUpdating} lastExtraction={lastExtraction} />
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div className="flex items-center gap-1">
              <PromptToolButton icon="attach" label="Attach context" />
              <PromptToolButton icon="scope" label="Workflow" active onClick={() => onInputChange(input.endsWith(" ") || !input ? `${input}/workflow` : `${input} /workflow`)} />
              <PromptToolButton icon="think" label="Reason" />
            </div>
            <button
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-zinc-300 ${canSubmit ? "bg-zinc-950 text-white hover:bg-zinc-800" : "bg-zinc-100 text-zinc-400"} disabled:cursor-not-allowed`}
              type="button"
              onClick={submitUpdate}
              disabled={isUpdating}
              aria-label={isUpdating ? "Logging update" : "Log Update"}
              title={isUpdating ? "Logging update" : "Log Update"}
            >
              {isUpdating ? <CommandSpinnerIcon /> : <CommandSendIcon />}
              <span className="sr-only">{isUpdating ? "Logging..." : "Log Update"}</span>
            </button>
          </div>
        </div>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</p>}
    </section>
  );
}

function PromptToolButton({ active = false, icon, label, onClick }) {
  return (
    <button
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2 text-xs transition ${active ? "border-zinc-300 bg-zinc-100 text-zinc-950" : "border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <PromptIcon name={icon} className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function PromptIcon({ name, className = "h-4 w-4" }) {
  const paths = {
    attach: (
      <>
        <path d="m8.5 12.5 5.8-5.8a3 3 0 1 1 4.2 4.2l-7.4 7.4a5 5 0 0 1-7.1-7.1l7.4-7.4" />
        <path d="m10 15 6.2-6.2" />
      </>
    ),
    scope: (
      <>
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="17" cy="17" r="2.5" />
        <path d="M9 8.5c3.5.7 5.8 3 6.5 6.5" />
      </>
    ),
    think: (
      <>
        <path d="M8 14.5A5.5 5.5 0 1 1 16.5 10c0 2.4-1.6 3.4-2.5 4.5" />
        <path d="M10 18h4" />
        <path d="M10.5 21h3" />
      </>
    ),
  };

  return (
    <svg className={`${className} fill-none stroke-current stroke-[1.8]`} aria-hidden="true" viewBox="0 0 24 24">
      {paths[name] || paths.scope}
    </svg>
  );
}

function CommandSendIcon() {
  return (
    <svg className="h-4 w-4 fill-none stroke-current stroke-[2]" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

function CommandSpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin fill-none stroke-current stroke-[2]" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3a9 9 0 1 1-8.5 6" />
    </svg>
  );
}

function ActivityIndicator({ isUpdating, lastExtraction }) {
  if (isUpdating) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-zinc-600">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-zinc-800" />
        </span>
        Understanding
      </div>
    );
  }

  if (lastExtraction) {
    const sourceLabel = lastExtraction.source === "agent" ? "Agent Report" : "Manual Update";
    return (
      <div className="inline-flex items-center gap-2 text-sm text-zinc-500">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        {sourceLabel}
      </div>
    );
  }

  return <div className="text-sm text-zinc-400">Listening for change</div>;
}

function OperationalState({ state }) {
  return (
    <section className="grid gap-6 border-y border-zinc-200 py-4 sm:grid-cols-3">
      {state.map((item) => (
        <article key={item.label}>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{item.label}</p>
          <div className="mt-2 truncate text-sm font-medium text-zinc-900">{item.value}</div>
          {item.detail && <div className="mt-1 truncate text-xs text-zinc-500">{item.detail}</div>}
        </article>
      ))}
    </section>
  );
}

function AtlasUnderstoodPanel({ extraction, onOpenObject }) {
  const groups = getUnderstoodGroups(extraction);

  return (
    <section className="flex flex-col">
      <SectionHeader title="Atlas Understood" />
      <div className="flex-1">
        {groups.some((group) => group.items.length) ? (
          <div className="grid gap-4">
            {groups.filter((group) => group.items.length).map((group) => (
              <div key={group.title}>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{group.title}</div>
                <div className="flex flex-wrap gap-2">
                  {group.items.slice(0, 8).map((item, index) => (
                    <EntityChip entity={item} key={`${group.title}-${item.name}-${index}`} onClick={item.clickable ? onOpenObject : undefined} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-1">
            <div className="text-sm font-medium text-zinc-900">Atlas is waiting for a change.</div>
            <div className="text-sm text-zinc-500">Tell Atlas what happened, and it will update the world model.</div>
          </div>
        )}
      </div>
    </section>
  );
}

function ObjectFocus({ object, onOpenObject }) {
  return (
    <button className="grid cursor-pointer gap-3 rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-zinc-200 transition hover:-translate-y-px hover:shadow-md hover:ring-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-300" type="button" onClick={() => onOpenObject(object.name)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">Primary Object</p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[24px] font-semibold tracking-[-0.03em] text-zinc-950">{object.name}</h3>
            <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          </div>
          <p className="mt-1 text-sm text-zinc-500">{object.type}</p>
        </div>
        <StatusPill status={object.status} prominent />
      </div>

      {object.attention.length ? <div className="truncate text-sm text-zinc-600">{object.attention[0]}</div> : null}
    </button>
  );
}

function ObjectSection({ title, rows }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{title}</div>
      <div className="grid gap-2">
        {rows.length ? rows.map((row, index) => <div className="text-sm leading-6 text-zinc-700" key={`${row}-${index}`}>{row}</div>) : <div className="text-sm text-zinc-400">Clear</div>}
      </div>
    </div>
  );
}

function WorldModelChanges({ extraction }) {
  const changes = getDetectedChanges(extraction);

  return (
    <section>
      <SectionHeader title="World Model Changes" />
      <div className="grid gap-1.5">
        {changes.map((change, index) => (
          <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-t border-zinc-200 py-3 first:border-t-0" key={`${change.label}-${change.target}-${index}`}>
            <div className="mt-1.5 h-2 w-2 rounded-full bg-zinc-900" />
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-zinc-950">{change.label}</div>
              <div className="text-sm text-zinc-600">{change.target}</div>
              {change.detail && <div className="mt-1 text-xs leading-5 text-zinc-500">{change.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChangeGroup({ title, rows, renderRow }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{title}</div>
      {rows.length ? (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((row, index) => (
            <div key={row.id || `${title}-${index}`}>
              {renderRow(row)}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-zinc-400">Waiting</div>
      )}
    </div>
  );
}

function EntityChip({ entity, onClick }) {
  const content = (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
      <span className="truncate">{entity.name}</span>
    </>
  );

  if (onClick) {
    return (
      <button className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300" type="button" onClick={() => onClick(entity.name)}>
        {content}
        <ChevronIcon className="h-3 w-3 shrink-0 opacity-45" />
      </button>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
      {content}
    </span>
  );
}

function TimelinePanel({ events }) {
  const recent = events.slice(-8).reverse();
  return (
    <section className="flex flex-col">
      <SectionHeader title="Activity Feed" />
      <div className="flex-1">
        {recent.length ? recent.map((event, index) => <EventRow event={event} key={`${event.type}-${event.timestamp}-${index}`} />) : <EmptyState label="No events yet." />}
      </div>
    </section>
  );
}

function EventRow({ event }) {
  const chips = getEventChips(event);

  return (
    <div className="grid gap-1.5 border-t border-zinc-200 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-400">{formatTimestamp(event.timestamp)}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{humanEventLabel(event)}</span>
        {event.details?.agent_name && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200">{event.details.agent_name}</span>}
        <span className="text-sm text-zinc-800">{event.target || "World Model"}</span>
      </div>
      <p className="text-sm leading-6 text-zinc-500">{event.details?.summary || event.details?.raw_input || "No details captured."}</p>
      {chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => <span className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200" key={chip}>{chip}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function CompactActivityRow({ event }) {
  const detail = compactChangeDetail(event);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-200 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{humanEventLabel(event)}</span>
          <span className="truncate text-sm text-zinc-800">{event.target || "World Model"}</span>
        </div>
        {detail && <div className="mt-1 truncate text-xs text-zinc-500">{detail}</div>}
      </div>
      <span className="shrink-0 text-xs text-zinc-400">{formatTimestamp(event.timestamp)}</span>
    </div>
  );
}

function ObjectDirectory({ onOpenObject, world }) {
  const workflows = getWorkflowCards(world);
  const [showArchived, setShowArchived] = useState(false);
  const activeWorkflows = workflows.filter((workflow) => !isArchivedWorkflow(workflow));
  const archivedWorkflows = workflows.filter(isArchivedWorkflow);
  const visibleWorkflows = showArchived ? archivedWorkflows : activeWorkflows;

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Workflows" />
        <div className="group/archive relative">
          <GlassButton
            aria-label={showArchived ? "Show active workflows" : "Show archived workflows"}
            aria-pressed={showArchived}
            className="output-filter-glass"
            onClick={() => setShowArchived((value) => !value)}
            size="trigger"
            status={showArchived ? "done" : "idle"}
            title={showArchived ? `Show active workflows (${activeWorkflows.length})` : `Show archived workflows (${archivedWorkflows.length})`}
          >
            <WorkflowIcon name="archive" className="h-3.5 w-3.5" />
          </GlassButton>
          <span className="pointer-events-none absolute right-0 top-10 z-30 hidden w-max max-w-48 rounded-md bg-zinc-950 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover/archive:block">
            {showArchived ? `Show active workflows (${activeWorkflows.length})` : `Show archived workflows (${archivedWorkflows.length})`}
          </span>
        </div>
      </div>

      {visibleWorkflows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleWorkflows.map((workflow) => <WorkflowOperationsCard workflow={workflow} key={workflow.name} onOpenObject={onOpenObject} />)}
        </div>
      ) : workflows.length ? <EmptyState label={showArchived ? "No workflows have been added to archive." : "No active workflows."} /> : <WorkflowEmptyState />}
    </section>
  );
}

function AgentsView({ onOpenObject }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(defaultAgentForm);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    try {
      const response = await fetch("/api/agents");
      const payload = await parseApiJson(response);
      if (!response.ok) {
        throw new Error(payload.error || "Could not load agents.");
      }
      const nextAgents = Array.isArray(payload.agents) ? payload.agents : [];
      setAgents(nextAgents);
      saveRegisteredAgents(nextAgents);
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  async function registerAgent(event) {
    event.preventDefault();
    setStatus("registering");
    setError("");
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentFormPayload(form)),
      });
      const payload = await parseApiJson(response);
      if (!response.ok) {
        throw new Error(payload.error || "Agent registration failed.");
      }
      setForm(defaultAgentForm);
      await loadAgents();
      setAgentSheetOpen(false);
      setStatus("idle");
    } catch (registerError) {
      setError(registerError.message);
      setStatus("idle");
    }
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Agents" />
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">{agents.length} registered</div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Sheet open={agentSheetOpen} onOpenChange={setAgentSheetOpen}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            aria-label="Register new agent"
            className="workflow-operations-card group relative grid min-h-[164px] cursor-pointer place-items-center overflow-hidden rounded-xl bg-white p-3.5 text-left shadow-sm ring-1 ring-dashed ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            onClick={() => setAgentSheetOpen(true)}
            type="button"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500 transition group-hover:border-zinc-300 group-hover:bg-zinc-100 group-hover:text-zinc-950">
              <Plus className="h-7 w-7" />
            </span>
          </button>
          {agents.map((agent) => (
            <AgentTile agent={agent} key={agent.id || agent.agent_id || agent.agent_name} onOpenObject={onOpenObject} />
          ))}
        </div>

        <SheetContent className="w-full bg-white sm:max-w-xl" side="right">
          <AtlasScrollArea className="h-full" viewportClassName="pr-2">
            <SheetHeader className="pr-8">
              <SheetTitle>Register Agent</SheetTitle>
              <SheetDescription>
                Add the agent details Atlas needs to invoke it, track runs, and route operator review.
              </SheetDescription>
            </SheetHeader>
            <AgentRegistrationForm form={form} setForm={setForm} status={status} onSubmit={registerAgent} />
          </AtlasScrollArea>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function AgentTile({ agent, onOpenObject }) {
  const enabled = agent.enabled !== false;
  const status = agent.last_status || "no runs";
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : commaList(agent.capabilities);
  const visibleCapabilities = capabilities.slice(0, 3);
  const hiddenCapabilityCount = Math.max(0, capabilities.length - visibleCapabilities.length);
  const agentName = agent.agent_name || agent.name || agent.agent_id || "Registered Agent";

  function openAgent() {
    onOpenObject?.(agentName, { root: "agents" });
  }

  return (
    <button
      className="workflow-operations-card group relative grid min-h-[164px] content-between overflow-hidden rounded-xl bg-white p-3.5 text-left shadow-sm ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300"
      onClick={openAgent}
      type="button"
    >
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span className="truncate">{agent.provider || "http"}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-zinc-400"}`} />
            <span className="max-w-[128px] truncate">{enabled ? "Enabled" : "Disabled"}</span>
          </span>
        </div>

        <div className="min-w-0">
          <h2 className="line-clamp-1 text-sm font-semibold tracking-[-0.01em] text-zinc-950">{agentName}</h2>
          <div className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500">{agent.description || agent.default_project || "Registered Atlas agent."}</div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {visibleCapabilities.length ? visibleCapabilities.map((capability) => (
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600" key={capability}>{capability}</span>
          )) : <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600">agent</span>}
          {hiddenCapabilityCount > 0 && <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600">+{hiddenCapabilityCount}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-2">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Runs</div>
          <div className="mt-0.5 truncate text-xs font-medium text-zinc-900">{agent.run_count || 0}</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Status</div>
          <div className="mt-0.5 truncate text-xs font-medium text-zinc-900">{status}</div>
        </div>
      </div>
    </button>
  );
}

function AgentRegistrationForm({ form, onSubmit, setForm, status }) {
  return (
    <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
      <AgentFormField label="Name" value={form.agent_name} onChange={(value) => setForm((current) => ({ ...current, agent_name: value }))} required />
      <AgentFormField label="ID" value={form.agent_id} onChange={(value) => setForm((current) => ({ ...current, agent_id: value }))} placeholder="auto from name" />
      <AgentFormField label="Provider" value={form.provider} onChange={(value) => setForm((current) => ({ ...current, provider: value }))} />
      <AgentFormField label="Run Endpoint" value={form.run_endpoint} onChange={(value) => setForm((current) => ({ ...current, run_endpoint: value }))} placeholder="https://..." />
      <AgentFormField label="Control Endpoint" value={form.control_endpoint} onChange={(value) => setForm((current) => ({ ...current, control_endpoint: value }))} placeholder="optional" />
      <AgentFormField label="Default Project" value={form.default_project} onChange={(value) => setForm((current) => ({ ...current, default_project: value }))} />
      <AgentFormField label="Capabilities" value={form.capabilities} onChange={(value) => setForm((current) => ({ ...current, capabilities: value }))} placeholder="research, markdown_report" />
      <AgentFormField label="Outputs" value={form.output_types} onChange={(value) => setForm((current) => ({ ...current, output_types: value }))} placeholder="markdown, json, csv" />
      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm">
        <span className="font-medium text-zinc-700">Requires review</span>
        <input
          checked={form.requires_review}
          className="h-4 w-4 accent-zinc-950"
          onChange={(event) => setForm((current) => ({ ...current, requires_review: event.target.checked }))}
          type="checkbox"
        />
      </label>
      <button
        className="mt-1 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={status === "registering" || !form.agent_name.trim()}
        type="submit"
      >
        {status === "registering" ? "Registering..." : "Register Agent"}
      </button>
    </form>
  );
}

function AgentFormField({ label, value, onChange, placeholder = "", required = false }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
    </label>
  );
}

function AgentWorkflowSetupForm({ agent, form, onSubmit, setForm, status }) {
  const stageRows = form.stages.map((stage, index) => (
    <AgentWorkflowStageNode
      index={index}
      isLast={index === form.stages.length - 1}
      key={`${stage.name}-${index}`}
      onChange={(patch) => setForm((current) => updateWorkflowSetupStage(current, index, patch))}
      stage={stage}
    />
  ));

  return (
    <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Agent</div>
        <div className="text-sm font-semibold text-zinc-950">{agent.name}</div>
        <div className="mt-1 truncate font-mono text-xs text-zinc-500">{agent.agent_id || agent.id}</div>
      </div>

      <FloatingWorkflowField id="workflow-name" label="Workflow Name" value={form.workflow_name} onChange={(value) => setForm((current) => ({ ...current, workflow_name: value }))} required />
      <FloatingWorkflowField id="workflow-objective" label="Objective" value={form.objective} onChange={(value) => setForm((current) => ({ ...current, objective: value }))} />
      <FloatingWorkflowField id="workflow-run-endpoint" label="Run Endpoint" value={form.run_endpoint} onChange={(value) => setForm((current) => ({ ...current, run_endpoint: value }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FloatingWorkflowField id="workflow-output-file" label="Output File" value={form.primary_output} onChange={(value) => setForm((current) => ({ ...current, primary_output: value }))} />
        <FloatingWorkflowField id="workflow-output-types" label="Output Types" value={form.output_types} onChange={(value) => setForm((current) => ({ ...current, output_types: value }))} />
      </div>
      <AgentTextAreaField
        helper="JSON run instructions Atlas sends to the agent when this workflow is triggered."
        label="Trigger Payload"
        labelAddon={<span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700"><FileJson className="h-3 w-3" /> JSON</span>}
        value={form.trigger_payload}
        onChange={(value) => setForm((current) => ({ ...current, trigger_payload: value }))}
      />

      <div className="rounded-xl border border-zinc-200 px-3 py-2.5">
        <Checkbox
          color="success"
          id="workflow-requires-review"
          isSelected={form.requires_review}
          onValueChange={(selected) => setForm((current) => workflowSetupWithReview(current, selected))}
          radius="md"
          size="md"
        >
          <span className="font-medium text-zinc-700">Requires Operator Review</span>
        </Checkbox>
      </div>

      <div className="grid gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Stage Mapping</div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Connected cards show how Atlas will surface progress from the agent run.</p>
        </div>
        <div className="grid gap-3">
          {stageRows}
        </div>
      </div>

      <GlassButton
        className="mt-1 justify-self-start"
        contentClassName="flex items-center gap-2 font-semibold"
        disabled={status === "creating" || !form.workflow_name.trim()}
        size="default"
        status="done"
        type="submit"
      >
        <CircleCheck className="h-4 w-4" />
        {status === "creating" ? "Creating..." : "Create Workflow"}
      </GlassButton>
    </form>
  );
}

const stageNodeColorClasses = {
  emerald: "border-emerald-300/70 bg-emerald-50 text-emerald-700",
  blue: "border-blue-300/70 bg-blue-50 text-blue-700",
  amber: "border-amber-300/70 bg-amber-50 text-amber-700",
  purple: "border-purple-300/70 bg-purple-50 text-purple-700",
  zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

function FloatingWorkflowField({ id, label, onChange, required = false, value }) {
  return (
    <FloatingLabelInput
      id={id}
      label={label}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      value={value}
    />
  );
}

function AgentWorkflowStageNode({ index, isLast, onChange, stage }) {
  const meta = getWorkflowSetupStageMeta(stage, index);
  const Icon = meta.icon;

  return (
    <div className="relative grid gap-2">
      <motion.div
        className="cursor-grab rounded-2xl active:cursor-grabbing"
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        whileDrag={{ scale: 1.025, zIndex: 30 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.18 }}
      >
        <div className={`relative overflow-hidden rounded-2xl border p-3 shadow-sm backdrop-blur ${stageNodeColorClasses[meta.color] || stageNodeColorClasses.zinc}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-transparent to-transparent opacity-80" />
          <div className="relative grid gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-white/70 ${stageNodeColorClasses[meta.color] || stageNodeColorClasses.zinc}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Stage {index + 1}</span>
                  <span className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{meta.type}</span>
                </div>
                <input
                  className="mt-1 block h-10 w-full min-w-0 rounded-lg border border-transparent bg-white/70 px-2 text-sm font-semibold text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-white focus:ring-2 focus:ring-white/80"
                  onChange={(event) => onChange({ name: event.target.value, status: event.target.value })}
                  value={stage.name}
                />
              </div>
            </div>
            <div className="grid min-w-0 gap-2 md:grid-cols-3">
              <AgentCompactField label="Owner" value={stage.agent} onChange={(value) => onChange({ agent: value })} />
              <AgentCompactField label="Input" value={stage.input} onChange={(value) => onChange({ input: value })} />
              <AgentCompactField label="Output" value={stage.output} onChange={(value) => onChange({ output: value })} />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              <ArrowRight className="h-3 w-3" />
              <span>{isLast ? "Final state" : "Connected"}</span>
            </div>
          </div>
        </div>
      </motion.div>
      {!isLast && (
        <div className="ml-6 flex h-5 items-center text-zinc-300">
          <div className="h-full border-l border-dashed border-zinc-300" />
          <ArrowRight className="ml-2 h-3.5 w-3.5 rotate-90" />
        </div>
      )}
    </div>
  );
}

function AgentCompactField({ label, value, onChange }) {
  return (
    <label className="grid min-w-0 gap-1 rounded-xl border border-white/60 bg-white/50 p-2">
      <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        className="block h-9 w-full min-w-0 rounded-lg border border-white/80 bg-white/80 px-2 text-xs text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-white focus:ring-2 focus:ring-white/80"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function getWorkflowSetupStageMeta(stage, index) {
  const name = String(stage.name || "").toLowerCase();
  if (index === 0 || name.includes("queued") || name.includes("trigger")) {
    return { color: "emerald", icon: Webhook, type: "trigger" };
  }
  if (name.includes("review") || name.includes("approved")) {
    return { color: name.includes("approved") ? "emerald" : "amber", icon: CircleCheck, type: "review" };
  }
  if (name.includes("progress") || name.includes("assigned")) {
    return { color: "blue", icon: Database, type: "action" };
  }
  return { color: "purple", icon: GitBranch, type: "stage" };
}

function AgentTextAreaField({ helper = "", label, labelAddon = null, value, onChange, placeholder = "" }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        <span>{label}</span>
        {labelAddon}
      </span>
      {helper && <span className="text-xs normal-case leading-5 tracking-normal text-zinc-500">{helper}</span>}
      <textarea
        className="min-h-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function updateWorkflowSetupStage(form, index, patch) {
  return {
    ...form,
    stages: form.stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage),
  };
}

const defaultAgentForm = {
  agent_name: "",
  agent_id: "",
  provider: "http",
  run_endpoint: "",
  control_endpoint: "",
  default_project: "Atlas",
  capabilities: "",
  output_types: "markdown, json",
  requires_review: true,
};

function agentFormPayload(form) {
  return {
    agent_name: form.agent_name,
    agent_id: form.agent_id,
    provider: form.provider,
    type: "http_webhook",
    run_endpoint: form.run_endpoint,
    control_endpoint: form.control_endpoint,
    default_project: form.default_project,
    capabilities: commaList(form.capabilities),
    output_types: commaList(form.output_types),
    requires_review: form.requires_review,
  };
}

function commaList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function WorkflowOperationsCard({ workflow, onOpenObject }) {
  const visibleAgents = workflow.agents.slice(0, 4);
  const hiddenAgentCount = Math.max(0, workflow.agents.length - visibleAgents.length);
  const outputCount = workflow.outputsReadyCount || 0;

  return (
    <button className="workflow-operations-card group relative grid min-h-[164px] cursor-pointer content-between overflow-hidden rounded-xl bg-white p-3.5 text-left shadow-sm ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300" type="button" onClick={() => onOpenObject(workflow.name)}>
      <div className="min-w-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span className="truncate">{workflow.lastUpdatedRelative || workflow.lastUpdate || "No update"}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${workflowStatusDotClass(workflow.status)}`} />
            <span className="max-w-[128px] truncate">{workflow.status}</span>
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="line-clamp-1 text-sm font-semibold tracking-[-0.01em] text-zinc-950">{workflow.name}</h2>
            <div className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500">{workflow.objective || workflow.nextAction || "Workflow run status and outputs."}</div>
          </div>
          <ChevronIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
        </div>

        <WorkflowStagePath workflow={workflow} />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <WorkflowAgentStack agents={visibleAgents} hiddenCount={hiddenAgentCount} />
            <span className="truncate text-xs text-zinc-500">Agents</span>
          </div>
          <WorkflowActionDots outputs={outputCount} actions={workflow.humanActions.length} />
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-2">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Outputs</div>
            <div className="mt-0.5 truncate text-xs font-medium text-zinc-900">{outputCount} ready</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Needs you</div>
            <div className="mt-0.5 truncate text-xs font-medium text-zinc-900">{workflow.humanActions[0] || workflow.nextAction || "Monitor"}</div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-zinc-950 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition duration-200 group-hover:opacity-100">
        <div className="truncate font-medium">{workflow.nextAction || "Open workflow"}</div>
        <div className="mt-0.5 truncate text-zinc-300">{workflow.outputsReady[0]?.name || workflow.currentStage || "Workflow activity"}</div>
      </div>
    </button>
  );
}

function WorkflowAgentStack({ agents, hiddenCount }) {
  if (!agents.length) {
    return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200">A</span>;
  }

  return (
    <div className="flex -space-x-1.5">
      {agents.map((agent) => (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-semibold text-white ring-2 ring-white" key={agent} title={agent}>
          {initials(agent)}
        </span>
      ))}
      {hiddenCount > 0 && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 ring-2 ring-white">+{hiddenCount}</span>}
    </div>
  );
}

function WorkflowActionDots({ outputs, actions }) {
  return (
    <div className="flex items-center -space-x-1.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-700 ring-2 ring-white" title={`${outputs} outputs`}>
        {outputs}
      </span>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-white ring-2 ring-white" title={`${actions} human actions`}>
        {actions}
      </span>
    </div>
  );
}

function workflowStatusDotClass(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("blocked") || value.includes("failed")) return "bg-red-500";
  if (value.includes("waiting") || value.includes("review") || value.includes("attention")) return "bg-amber-500";
  if (value.includes("complete")) return "bg-emerald-500";
  return "bg-zinc-900";
}

function isArchivedWorkflow(workflow) {
  return normalizeWorkflowStatus(workflow.status || workflow.currentStage) === "archived";
}

function initials(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "A";
}

function WorkflowStagePath({ workflow }) {
  const allStages = workflowStages(workflow);
  const visibleStages = allStages.slice(0, 4);
  const hiddenCount = Math.max(0, allStages.length - visibleStages.length);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {visibleStages.map((stage, index) => (
        <React.Fragment key={`${stage.name}-${index}`}>
          <span className={`inline-flex max-w-[112px] items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ring-1 ${workflowStagePathClass(stage, workflow)}`}>
            <span className="truncate">{stage.name}</span>
            <span>{workflowStagePathMarker(stage, workflow)}</span>
          </span>
          {(index < visibleStages.length - 1 || hiddenCount > 0) && <span className="text-[11px] text-zinc-300">→</span>}
        </React.Fragment>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 ring-1 ring-zinc-200">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

function workflowStagePathClass(stage, workflow) {
  const status = normalizeWorkflowStatus(stage.status);
  if (status === "completed") {
    return "bg-zinc-950 text-white ring-zinc-950";
  }
  if (workflowStagePathIsActive(stage, workflow)) {
    return "bg-white text-zinc-900 ring-zinc-300";
  }
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
}

function workflowStagePathMarker(stage, workflow) {
  const status = normalizeWorkflowStatus(stage.status);
  if (status === "completed") return "✓";
  if (workflowStagePathIsActive(stage, workflow)) return "●";
  return "○";
}

function workflowStagePathIsActive(stage, workflow) {
  const status = normalizeWorkflowStatus(stage.status);
  return (
    sameName(stage.name, workflow.currentStage) ||
    sameName(stage.name, workflow.status) ||
    ["in_progress", "needs_review", "revision_requested", "blocked", "failed"].includes(status)
  );
}

function WorkflowEmptyState() {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 md:col-span-2 xl:col-span-3 2xl:col-span-4">
      <div className="text-sm font-medium text-zinc-950">No workflows yet.</div>
      <div className="mt-1 text-sm text-zinc-500">Send an agent report with workflow context to begin tracking work.</div>
    </div>
  );
}

function ObjectCardSection({ title, objects, onOpenObject, prominent = false }) {
  if (!objects.length && prominent) {
    return null;
  }

  return (
    <section>
      <SectionHeader title={title} />
      <div className="grid gap-3">
        {objects.length ? objects.map((object) => <HierarchyObjectCard object={object} key={object.name} onOpenObject={onOpenObject} />) : <EmptyState label={`No ${title.toLowerCase()} yet.`} />}
      </div>
    </section>
  );
}

function HierarchyObjectCard({ object, onOpenObject }) {
  return (
    <details className="group rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-zinc-300">
      <summary className="grid cursor-pointer list-none gap-3 focus:outline-none focus:ring-2 focus:ring-zinc-300 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button className="truncate text-left text-[17px] font-semibold tracking-[-0.02em] text-zinc-950 underline-offset-2 hover:underline" type="button" onClick={(event) => {
              event.preventDefault();
              onOpenObject(object.name);
            }}>
              {object.name}
            </button>
            <StatusPill status={object.status} />
          </div>
          <div className="mt-1 line-clamp-1 text-sm text-zinc-500">{object.summary || object.detail}</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <ObjectMetric label="Agents" value={object.agentCount} />
          <ObjectMetric label="Open actions" value={object.openActionCount} />
          <ObjectMetric label="Outputs" value={object.outputsProducedCount} />
          <ObjectMetric label="Last update" value={object.lastUpdated || "None"} />
          <ChevronIcon className="h-4 w-4 text-zinc-300 transition group-open:rotate-90" />
        </div>
      </summary>
      <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-5">
        <HierarchyChildGroup label="Work Items" items={object.children.workItems} onOpenObject={onOpenObject} />
        <HierarchyChildGroup label="People" items={object.children.people} onOpenObject={onOpenObject} />
        <HierarchyChildGroup label="Agents" items={object.children.agents} onOpenObject={onOpenObject} />
        <HierarchyChildGroup label="Systems" items={object.children.systems} onOpenObject={onOpenObject} />
        <HierarchyChildGroup label="Actions" items={object.children.actions} />
      </div>
    </details>
  );
}

function ObjectMetric({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1">
      <span className="font-semibold text-zinc-900">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function HierarchyChildGroup({ label, items, onOpenObject }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label} ({items.length})</div>
      <div className="grid gap-1.5">
        {items.length ? items.slice(0, 5).map((item, index) => (
          onOpenObject && item.clickable !== false ? (
            <button className="truncate rounded-md px-2 py-1 text-left text-xs text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300" key={`${label}-${item.name}-${index}`} type="button" onClick={() => onOpenObject(item.name)}>
              {item.name}
            </button>
          ) : (
            <div className="truncate px-2 py-1 text-xs text-zinc-600" key={`${label}-${item.name}-${index}`}>{item.name}</div>
          )
        )) : <div className="px-2 py-1 text-xs text-zinc-400">Clear</div>}
      </div>
    </div>
  );
}

function SecondaryObjectSection({ title, objects, onOpenObject, collapsed = false }) {
  if (!objects.length) {
    return null;
  }

  return (
    <details className="group border-t border-zinc-200 pt-3" open={!collapsed}>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md py-1 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300">
        <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">{title} ({objects.length})</div>
        <ChevronIcon className="h-4 w-4 text-zinc-300 transition group-open:rotate-90" />
      </summary>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {objects.map((object) => <SecondaryObjectCard object={object} key={object.name} onOpenObject={onOpenObject} />)}
      </div>
    </details>
  );
}

function SecondaryObjectCard({ object, onOpenObject }) {
  return (
    <button className="grid cursor-pointer gap-1 rounded-lg px-3 py-2 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300" type="button" onClick={() => onOpenObject(object.name)}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-zinc-800">{object.name}</span>
        <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
      </div>
      <span className="truncate text-xs text-zinc-500">{object.detail}</span>
    </button>
  );
}

function WorkflowDetailView({ workflow, onOpenObject, onOpenWorkflows, onToast, onWorkflowCommand, world }) {
  return (
    <section className="grid w-full min-w-0 gap-4 overflow-hidden">
      <WorkflowHeaderPanel workflow={workflow} onOpenObject={onOpenObject} onOpenWorkflows={onOpenWorkflows} onToast={onToast} onWorkflowCommand={onWorkflowCommand} world={world} />
      <ReviewQueuePanel workflow={workflow} />

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
        <div className="grid min-w-0 gap-4 overflow-hidden">
          <WorkflowProgressPanel workflow={workflow} />
        </div>
        <div className="grid min-w-0 gap-4 overflow-hidden">
          <OutputsPanel workflow={workflow} onToast={onToast} onWorkflowCommand={onWorkflowCommand} world={world} />
          <ActivityFeedPanel workflow={workflow} />
        </div>
      </div>
    </section>
  );
}

function WorkflowHeaderPanel({ workflow, onOpenObject, onOpenWorkflows, onToast, onWorkflowCommand, world }) {
  return (
    <div className="relative z-20 min-w-0 overflow-visible border-b border-zinc-200 bg-white/50 px-4 py-4 shadow-sm ring-1 ring-zinc-200/70 lg:px-5" id="overview">
      <Breadcrumb items={[{ name: "Workflows", clickable: true, action: "workflows" }, { name: workflow.name }]} onOpenObject={onOpenObject} onOpenWorkflows={onOpenWorkflows} />
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h2 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-[-0.025em] text-zinc-950">{workflow.name}</h2>
            <span className="max-w-full truncate font-mono text-xs text-zinc-400">wf_{slugify(workflow.name).slice(0, 18)}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <WorkflowMeta
              leading={<WorkflowTriggerButton workflow={workflow} onToast={onToast} onWorkflowCommand={onWorkflowCommand} world={world} />}
              label="Trigger"
              value={workflow.activity[0]?.details?.source === "manual" ? "Operator update" : "Agent report"}
            />
            <WorkflowMeta icon="clock" label="Updated" value={workflow.lastUpdatedRelative || workflow.lastUpdate || "never"} />
            <WorkflowStagePill stage={workflow.currentStage || "Waiting"} status={workflow.status} />
            <WorkflowAgentDropdown agents={workflow.agents} onOpenObject={onOpenObject} />
          </div>
        </div>
        <WorkflowActionsMenu workflow={workflow} onWorkflowCommand={onWorkflowCommand} world={world} />
      </div>
    </div>
  );
}

function WorkflowActionsMenu({ workflow, onWorkflowCommand, world }) {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const archived = isArchivedWorkflow(workflow);

  async function submitWorkflowAction(action) {
    if (!onWorkflowCommand || pendingAction) return;
    if (action.id === "delete" && !confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3500);
      return;
    }

    setPendingAction(action.id);
    try {
      await onWorkflowCommand(buildWorkflowCommandPayload({
        workflow,
        intent: {
          status: action.status,
          summary: action.summary(workflow),
          confidence: 0.95,
          source: action.source,
        },
        updateText: action.summary(workflow),
        world: world || emptyWorld,
        stayOnCurrentView: true,
      }));
      setOpen(false);
      setConfirmingDelete(false);
    } finally {
      setPendingAction("");
    }
  }

  const actions = [
    archived
      ? { id: "restore", label: "Remove from archive", status: "In Progress", source: "operator-restore", icon: "archive", tone: "text-zinc-700", summary: (item) => `Removed workflow ${item.name} from archive.` }
      : { id: "archive", label: "Add to archive", status: "Archived", source: "operator-archive", icon: "archive", tone: "text-zinc-700", summary: (item) => `Archived workflow ${item.name}.` },
    { id: "cancel", label: "Cancel workflow", status: "Canceled", source: "operator-cancel", icon: "x", tone: "text-orange-700", summary: (item) => `Canceled workflow ${item.name}.` },
    { id: "delete", label: confirmingDelete ? "Confirm delete" : "Delete", status: "Canceled", source: "operator-delete", icon: "trash", tone: "text-red-700", summary: (item) => `Deleted workflow ${item.name}.` },
  ];

  return (
    <div className="relative ml-auto shrink-0">
      <button
        aria-expanded={open}
        aria-label="Workflow actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/70 text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:bg-white hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!onWorkflowCommand || Boolean(pendingAction)}
        onClick={() => setOpen((value) => !value)}
        title="Workflow actions"
        type="button"
      >
        <WorkflowIcon name="ellipsis" className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-xl ring-1 ring-zinc-950/5">
          {actions.map((action) => (
            <button
              className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-300 ${action.tone}`}
              disabled={Boolean(pendingAction)}
              key={action.id}
              onClick={() => submitWorkflowAction(action)}
              type="button"
            >
              <WorkflowIcon name={action.icon} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{pendingAction === action.id ? "Working..." : action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowTriggerButton({ workflow, onToast, onWorkflowCommand, world }) {
  const [state, setState] = useState("idle");
  const isRunning = state === "running";
  const isDone = state === "done";
  const isError = state === "error";
  const linkedAgent = workflow.agentId ? null : inferRegisteredAgentForWorkflow(workflow, workflow.name, loadRegisteredAgents());
  const effectiveAgentId = workflow.agentId || linkedAgent?.agent_id || linkedAgent?.id || "";
  const canTrigger = sameName(workflow.name, "Hacker News Opportunity Scan") || Boolean(effectiveAgentId);

  async function triggerRun() {
    if (!canTrigger || isRunning) {
      return;
    }

    setState("running");
    try {
      if (effectiveAgentId && !sameName(workflow.name, "Hacker News Opportunity Scan")) {
        await requestRegisteredAgentRun({ ...workflow, agentId: effectiveAgentId });
      } else {
        await requestOpportunityAgentRun({
          reviewFeedback: workflow.status === "Revision Requested" ? latestWorkflowRevisionRequest(workflow) : "",
          rerunReason: workflow.status === "Revision Requested" ? "operator_revision_requested" : "manual_trigger",
        });
      }
      if (onWorkflowCommand) {
        await onWorkflowCommand(buildWorkflowCommandPayload({
          workflow,
          intent: {
            status: "In Progress",
            summary: `Triggered workflow run for ${workflow.name}.`,
            confidence: 0.95,
            source: "atlas-trigger",
          },
          updateText: `Triggered workflow run for ${workflow.name}.`,
          world: world || emptyWorld,
          stayOnCurrentView: true,
        }));
      }
      onToast?.({
        variant: "success",
        title: "Run initiated",
        description: `${workflow.name} has started.`,
      });
      setState("done");
      setTimeout(() => setState("idle"), 2400);
    } catch (error) {
      setState("error");
      onToast?.({
        variant: "error",
        title: "Run blocked",
        description: error.message || "Atlas could not initiate this workflow run.",
      });
      if (onWorkflowCommand) {
        await onWorkflowCommand(buildWorkflowCommandPayload({
          workflow,
          intent: {
            status: "Blocked",
            summary: error.message || "Opportunity agent trigger is not configured.",
            confidence: 0.9,
            source: "atlas-trigger",
          },
          updateText: error.message || "Opportunity agent trigger is not configured.",
          world: world || emptyWorld,
          stayOnCurrentView: true,
        }));
      }
      setTimeout(() => setState("idle"), 3200);
    }
  }

  return (
    <GlassButton
      aria-label={isRunning ? "Triggering workflow run" : "Trigger workflow run"}
      className="workflow-trigger-glass"
      disabled={!canTrigger || isRunning}
      status={isRunning ? "running" : isDone ? "done" : isError ? "error" : "idle"}
      onClick={triggerRun}
      size="trigger"
      title={canTrigger ? "Trigger workflow run" : "No trigger configured for this workflow"}
    >
      <ZapIcon className="h-4 w-4" />
    </GlassButton>
  );
}

function opportunityScanRequest({ reviewFeedback = "", rerunReason = "manual_trigger" } = {}) {
  return {
    feeds: ["topstories", "askstories", "showstories"],
    limit: 50,
    include_comments: true,
    max_comments_per_story: 20,
    review_feedback: reviewFeedback,
    rerun_reason: rerunReason,
  };
}

async function requestOpportunityAgentRun(options = {}) {
  const response = await fetch("/api/agents/opportunity-discovery/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opportunityScanRequest(options)),
  });
  const payload = await parseApiJson(response);
  if (!response.ok) {
    throw new Error(payload.error || "Trigger request failed.");
  }
  return payload;
}

async function requestRegisteredAgentRun(workflow) {
  const agentId = workflow.agentId || "";
  if (!agentId) {
    throw new Error("This workflow is not linked to a registered agent.");
  }
  const body = {
    project: workflow.project || workflow.name,
    workflow_name: workflow.name,
  };
  if (workflow.triggerPayload && typeof workflow.triggerPayload === "object" && !Array.isArray(workflow.triggerPayload)) {
    body.inputs = workflow.triggerPayload;
  }
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseApiJson(response);
  if (!response.ok) {
    throw new Error(payload.error || "Atlas could not start this agent run.");
  }
  if (payload.run?.status === "failed") {
    throw new Error(payload.run.error || payload.run.message || "Agent run dispatch failed.");
  }
  return payload;
}

async function parseApiJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    const contentType = response.headers.get("content-type") || "";
    const looksLikeHtml = contentType.includes("text/html") || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");
    if (looksLikeHtml) {
      throw new Error("Atlas API route returned the web app shell instead of JSON. The API deployment or route mapping is not active.");
    }
    throw new Error("Atlas API returned a non-JSON response.");
  }
}

function WorkflowStagePill({ stage, status }) {
  const tone = workflowTone(status || stage);
  const label = status || stage;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-50`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`} />
      </span>
      <span className="shrink-0 text-zinc-500">Stage</span>
      <span className="min-w-0 truncate font-medium text-zinc-950">{label}</span>
    </div>
  );
}

function WorkflowAgentDropdown({ agents, onOpenObject }) {
  const [isOpen, setIsOpen] = useState(false);
  const count = agents.length;

  return (
    <div className="relative min-w-0 text-xs">
      <button
        className="flex min-w-0 cursor-pointer select-none items-center gap-2 rounded-md text-left transition hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <WorkflowIcon name="user" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="shrink-0 text-zinc-500">Agents</span>
        <span className="min-w-0 truncate font-medium text-zinc-950">{count}</span>
        <ChevronIcon className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-72 overflow-hidden rounded-2xl bg-white p-1 shadow-xl ring-1 ring-zinc-200">
          {agents.length ? agents.map((agent) => (
            <button
              className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              key={agent}
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenObject(agent);
              }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[11px] font-semibold text-zinc-700">
                {initials(agent)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-950">{agent}</div>
                <div className="truncate text-xs text-zinc-500">Assigned to this workflow</div>
              </div>
            </button>
          )) : (
            <div className="px-3 py-2 text-xs text-zinc-500">No agents assigned.</div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowMeta({ icon, leading = null, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-visible">
      {leading || (icon && <WorkflowIcon name={icon} className="h-3.5 w-3.5 text-zinc-400" />)}
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 truncate font-medium text-zinc-950">{value}</span>
    </div>
  );
}

function WorkflowProgressPanel({ workflow }) {
  const progress = workflowProgress(workflow);

  return (
    <WorkflowPanel id="progress">
      <WorkflowPanelHeader title="Workflow Progression" icon="checks" />
      <div className="space-y-5 p-4">
        <div className="space-y-2.5">
          <div className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-2xl font-semibold tabular-nums text-zinc-950">{progress.percent}%</span>
              <span className="min-w-0 truncate text-xs text-zinc-500">{progress.completed} of {progress.total} stages complete</span>
            </div>
            <WorkflowStatusBadge status={workflow.status} pulse>{workflow.currentStage || workflow.status}</WorkflowStatusBadge>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="absolute inset-y-0 left-0 rounded-full bg-zinc-950 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <ol className="relative space-y-1">
          {workflowStages(workflow).map((step, index, steps) => <WorkflowStepRow step={step} isLast={index === steps.length - 1} key={`${step.name}-${index}`} />)}
        </ol>
      </div>
    </WorkflowPanel>
  );
}

function WorkflowStepRow({ step, isLast }) {
  const meta = workflowStepMeta(step.status);
  return (
    <li className="relative flex min-w-0 gap-3 overflow-hidden">
      {!isLast && <span className={`absolute left-[13px] top-7 h-[calc(100%-12px)] w-px ${step.status === "completed" ? "bg-emerald-300" : "bg-zinc-200"}`} />}
      <div className={`z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${meta.ring}`}>
        <WorkflowIcon name={meta.icon} className={`h-3.5 w-3.5 ${step.status === "in_progress" ? "animate-spin" : ""}`} />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 py-2 transition-colors hover:bg-zinc-100/70">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-950">{step.name}</span>
            {step.agent && <span className="hidden min-w-0 truncate font-mono text-[11px] text-zinc-500 sm:inline">{step.agent}</span>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden font-mono text-[11px] text-zinc-500">
            <span className="shrink-0">{titleize(step.status || "queued")}</span>
            {step.detail && <><span className="text-zinc-300">·</span><span className="truncate">{step.detail}</span></>}
            {step.input && <><span className="text-zinc-300">·</span><span className="truncate">{step.input}</span></>}
            {step.output && <><span className="text-zinc-300">·</span><span className="truncate">{step.output}</span></>}
          </div>
        </div>
        <WorkflowStatusBadge status={step.status}>{meta.label}</WorkflowStatusBadge>
      </div>
    </li>
  );
}

function ReviewQueuePanel({ workflow }) {
  const terminal = isTerminalWorkflowState(workflow.status || workflow.currentStage);
  const humanActions = terminal || !isWorkflowReviewStage(workflow.status || workflow.currentStage) ? [] : workflow.humanActions;
  return (
    <WorkflowPanel id="review">
      <WorkflowPanelHeader title="Operator Attention" icon="inbox" count={humanActions.length || undefined} action={humanActions.length ? <WorkflowStatusBadge status="review" pulse>action needed</WorkflowStatusBadge> : null} />
      {humanActions.length ? (
        <ul className="divide-y divide-zinc-200">
          {humanActions.map((action, index) => (
            <li className="min-w-0 space-y-3 overflow-hidden p-4 transition-colors hover:bg-zinc-50" key={`${action}-${index}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words text-sm font-medium leading-snug text-zinc-950">{action}</h3>
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden font-mono text-[11px] text-zinc-500">
                    <span className="truncate">{workflow.agents.at(-1) || "Atlas"}</span>
                    <span className="text-zinc-300">·</span>
                    <span className="truncate">{workflow.currentStage || "Review"}</span>
                  </div>
                </div>
                <WorkflowStatusBadge status="review">high</WorkflowStatusBadge>
              </div>
              <p className="break-words text-xs leading-relaxed text-zinc-500">{workflow.outputsReady[index]?.name || workflow.outputsReady[0]?.name || workflow.outputs[0]?.name || "Workflow output"} is ready for operator review.</p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">agent confidence</span>
                <span className="font-mono text-xs tabular-nums text-zinc-950">{workflowConfidence(workflow)}%</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <div className="p-4"><EmptyState label="No human action waiting." /></div>}
    </WorkflowPanel>
  );
}

function OutputsPanel({ workflow, onWorkflowCommand, onToast, world }) {
  const [selectedOutputContext, setSelectedOutputContext] = useState(null);
  const [filterMode, setFilterMode] = useState("review");
  const [filterOpen, setFilterOpen] = useState(false);
  const terminal = isTerminalWorkflowState(workflow.status || workflow.currentStage);
  const reviewStage = isWorkflowReviewStage(workflow.status || workflow.currentStage);
  const reviewableOutputs = useMemo(() => terminal || !reviewStage ? [] : workflow.outputs.filter(isOperatorReviewOutput), [reviewStage, terminal, workflow.outputs]);
  const approvedOutputs = useMemo(() => workflow.outputs.filter(isApprovedOutput), [workflow.outputs]);
  const visibleOutputs = useMemo(() => {
    if (filterMode === "approved") return approvedOutputs;
    return reviewableOutputs;
  }, [approvedOutputs, filterMode, reviewableOutputs]);
  const visibleFiles = useMemo(() => flattenOutputFiles(workflow, visibleOutputs), [visibleOutputs, workflow]);
  const filterLabel = OUTPUT_FILTERS.find((filter) => filter.id === filterMode)?.label || "Review only";

  return (
    <>
      <WorkflowPanel id="outputs">
        <WorkflowPanelHeader
          title="Outputs"
          icon="output"
          count={visibleOutputs.length || undefined}
          action={workflow.outputs.length ? (
            <div className="relative">
              <GlassButton
                aria-expanded={filterOpen}
                aria-label={`Output filter: ${filterLabel}`}
                className="output-filter-glass"
                onClick={() => setFilterOpen((open) => !open)}
                size="trigger"
                title={`Output filter: ${filterLabel}`}
              >
                <WorkflowIcon name="filter" className="h-3.5 w-3.5" />
              </GlassButton>
              {filterOpen && (
                <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-xl ring-1 ring-zinc-950/5">
                  {OUTPUT_FILTERS.map((filter) => {
                    const count = filter.id === "approved" ? approvedOutputs.length : reviewableOutputs.length;
                    return (
                      <button
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-zinc-50 ${filterMode === filter.id ? "text-zinc-950" : "text-zinc-500"}`}
                        key={filter.id}
                        type="button"
                        onClick={() => {
                          setFilterMode(filter.id);
                          setFilterOpen(false);
                        }}
                      >
                        <span>{filter.label}</span>
                        <span className="font-mono text-[11px] text-zinc-400">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        />
        <div className="p-4">
          {visibleFiles.length ? (
            <OutputFileBrowser
              files={visibleFiles}
              onOpenFile={(file) => setSelectedOutputContext({ output: file.output, initialFilePath: `${file.kind || "files"}/${file.name}` })}
            />
          ) : <EmptyState label={workflow.outputs.length ? "No output files match this filter." : "No outputs yet."} />}
        </div>
      </WorkflowPanel>
      {selectedOutputContext && (
        <OutputWorkspaceModal
          workflow={workflow}
          output={selectedOutputContext.output}
          initialFilePath={selectedOutputContext.initialFilePath}
          onClose={() => setSelectedOutputContext(null)}
          onWorkflowCommand={onWorkflowCommand}
          onToast={onToast}
          world={world}
        />
      )}
    </>
  );
}

const OUTPUT_FILTERS = [
  { id: "review", label: "Review only" },
  { id: "approved", label: "Approved" },
];

function isOperatorReviewOutput(output) {
  const status = String(output?.status || "").toLowerCase();
  if (["approved", "completed"].some((terminalStatus) => status.includes(terminalStatus))) {
    return false;
  }
  const name = String(output?.name || "");
  const documents = Array.isArray(output?.documents) ? output.documents : [];
  const reviewStatuses = ["ready_for_review", "needs_review", "revision_requested", "rejected", "failed", "blocked"];
  return (
    reviewStatuses.some((reviewStatus) => status.includes(reviewStatus)) ||
    documents.some((document) => /model-analysis\.(md|json)$/i.test(document?.name || "")) ||
    sameName(name, "Model analysis")
  );
}

function isApprovedOutput(output) {
  const status = String(output?.status || "").toLowerCase();
  return ["approved", "completed", "accepted"].some((terminalStatus) => status.includes(terminalStatus));
}

function OutputWorkspaceModal({ workflow, output, initialFilePath, onClose, onWorkflowCommand, onToast, world }) {
  const files = useMemo(() => outputWorkspaceFiles(workflow, output), [workflow, output]);
  const reviewable = !isTerminalWorkflowState(workflow.status || workflow.currentStage) && isWorkflowReviewStage(workflow.status || workflow.currentStage) && isOperatorReviewOutput(output);
  const viewerComponent = useMemo(() => ({
    name: output.name,
    version: `${workflow.currentStage || workflow.status || "Workflow"} · ${files.length} files`,
    files: files.map((file) => ({
      ...file,
      path: `${file.kind || "files"}/${file.name}`,
      content: String(file.content || ""),
    })),
  }), [files, output.name, workflow.currentStage, workflow.status]);
  const [reviewState, setReviewState] = useState("idle");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isReviewing = reviewState === "approving" || reviewState === "denying" || reviewState === "rerunning";

  async function reviewOutput(decision) {
    if (!onWorkflowCommand || isReviewing) return;
    const approved = decision === "approved";
    setReviewState(approved ? "approving" : "denying");
    const operatorFeedback = reviewFeedback.trim();
    const approvalFeedback = operatorFeedback
      ? `Operator approved ${output.name}. Feedback: ${operatorFeedback}`
      : `Operator approved ${output.name}.`;
    const revisionFeedback = operatorFeedback
      ? `Operator denied ${output.name} and requested revision. Feedback: ${operatorFeedback}`
      : `Operator denied ${output.name} and requested revision.`;
    try {
      await onWorkflowCommand(buildWorkflowCommandPayload({
        workflow,
        intent: {
          status: approved ? "Approved" : "Revision Requested",
          summary: approved
            ? approvalFeedback
            : revisionFeedback,
          confidence: 0.95,
          source: "operator-output-review",
          outputs: [
            {
              name: output.name,
              type: output.type || "Output",
              status: approved ? "approved" : "revision_requested",
              artifacts: output.artifacts || [],
              documents: output.documents || [],
              summary: approved
                ? approvalFeedback
                : revisionFeedback,
            },
          ],
        },
        updateText: approved
          ? approvalFeedback
          : revisionFeedback,
        world: world || emptyWorld,
        stayOnCurrentView: true,
      }));
      if (!approved) {
        setReviewState("rerunning");
        await requestOpportunityAgentRun({
          reviewFeedback: revisionFeedback,
          rerunReason: "operator_denied_output",
        });
      }
      onToast?.({
        variant: approved ? "success" : "warning",
        title: approved ? "Output approved" : "Revision requested",
        description: approved
          ? `${output.name} was approved.`
          : `${output.name} was denied and a rerun was requested.`,
      });
      onClose();
    } catch (error) {
      setReviewState("error");
      onToast?.({
        variant: "error",
        title: "Review failed",
        description: error.message || "Atlas could not record this review.",
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 px-3 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${output.name} output workspace`}>
      <div className="grid max-h-[90vh] w-full max-w-7xl min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
        <header className="flex min-w-0 flex-col gap-3 border-b border-zinc-200 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-sm font-semibold text-zinc-950">{output.name}</h3>
              <WorkflowStatusBadge status={output.status || workflow.status || "reported"}>{titleize(output.status || workflow.status || "reported")}</WorkflowStatusBadge>
            </div>
            {reviewState === "error" && <p className="mt-1 text-xs font-medium text-red-600">Review update or rerun request failed. Try again or submit a manual workflow update.</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {reviewable && (
              <>
                <GlassButton
                  aria-label={feedbackOpen ? "Hide operator feedback" : "Add operator feedback"}
                  aria-pressed={feedbackOpen}
                  className="output-filter-glass"
                  onClick={() => setFeedbackOpen((open) => !open)}
                  size="trigger"
                  status={feedbackOpen || reviewFeedback.trim() ? "running" : "idle"}
                  title={feedbackOpen ? "Hide operator feedback" : "Add operator feedback"}
                >
                  <WorkflowIcon name="chat" className="h-3.5 w-3.5" />
                </GlassButton>
                <GlassButton
                  className="output-review-glass output-review-glass-deny"
                  contentClassName="flex items-center justify-center px-4 py-2 text-xs font-semibold"
                  onClick={() => reviewOutput("denied")}
                  disabled={!onWorkflowCommand || isReviewing}
                  size="sm"
                  status="error"
                >
                  {reviewState === "denying" ? "Recording..." : reviewState === "rerunning" ? "Rerunning..." : "Deny"}
                </GlassButton>
                <GlassButton
                  className="output-review-glass output-review-glass-approve"
                  contentClassName="flex items-center justify-center px-4 py-2 text-xs font-semibold"
                  onClick={() => reviewOutput("approved")}
                  disabled={!onWorkflowCommand || isReviewing}
                  size="sm"
                  status="done"
                >
                  {reviewState === "approving" ? "Approving..." : "Approve"}
                </GlassButton>
              </>
            )}
            <button className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300" type="button" onClick={onClose} aria-label="Close output workspace">
              <WorkflowIcon name="x" className="h-4 w-4" />
            </button>
          </div>
        </header>
        <AtlasScrollArea className="min-h-0" viewportClassName="p-4">
          {reviewable && feedbackOpen && (
            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-600">Operator feedback</span>
              <textarea
                className="min-h-20 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-50"
                value={reviewFeedback}
                onChange={(event) => setReviewFeedback(event.target.value)}
                disabled={isReviewing}
                placeholder="Optional notes for approval, or revision instructions for a denied output."
              />
            </label>
          )}
          <ComponentFileViewer component={viewerComponent} initialPath={initialFilePath} />
        </AtlasScrollArea>
      </div>
    </div>
  );
}

function flattenOutputFiles(workflow, outputs) {
  return outputs.flatMap((output) => outputWorkspaceFiles(workflow, output).map((file) => ({
    ...file,
    id: `${output.name}-${output.createdAt || output.updatedAt || output.timestamp || "current"}-${file.kind || "file"}-${file.name}`,
    output,
    outputName: output.name,
    outputStatus: output.status || "reported",
    outputType: output.type || "Output",
    createdAt: outputTimestamp(workflow, output),
    size: Number(file.size) || String(file.content || "").length,
    type: file.mime || file.kind || "",
  })));
}

function outputTimestamp(workflow, output) {
  const directTimestamp = output.created_at || output.createdAt || output.timestamp || output.updated_at || output.updatedAt;
  if (directTimestamp) {
    return directTimestamp;
  }
  const relatedEvents = workflow.activity.filter((event) => outputRelatesToEvent(output, event));
  return relatedEvents[0]?.timestamp || workflow.updatedAt || workflow.createdAt || "";
}

function outputWorkspaceFiles(workflow, output) {
  const eventRows = workflow.activity.filter((event) => outputRelatesToEvent(output, event));
  const documents = dedupeDocumentFiles([
    ...(Array.isArray(output.documents) ? output.documents : []),
    ...eventRows.flatMap((event) => event.details?.documents || []),
    ...eventRows.flatMap((event) => (event.details?.outputs || []).filter((item) => sameName(item.name, output.name)).flatMap((item) => item.documents || [])),
  ]);
  const opportunityAnalysisOnly = isOpportunityDiscoveryWorkflow(workflow);
  const visibleDocuments = opportunityAnalysisOnly ? documents.filter(isModelAnalysisDocument) : documents;
  const artifacts = dedupeNames([
    ...(Array.isArray(output.artifacts) ? output.artifacts : []),
    ...eventRows.flatMap((event) => event.details?.artifacts || []),
  ]).filter((artifact) => !opportunityAnalysisOnly || /^model-analysis\.md$/i.test(artifact));
  const files = visibleDocuments.map((document) => fileFromDocument(document, output, workflow, eventRows));
  if (!opportunityAnalysisOnly) {
    files.push({
      name: `${slugify(output.name)}-summary.md`,
      kind: "markdown",
      mime: "text/markdown",
      content: outputMarkdownSummary(workflow, output, eventRows),
    });
    files.push(
      {
        name: `${slugify(output.name)}-activity.csv`,
        kind: "csv",
        mime: "text/csv",
        content: outputActivityCsv(eventRows),
      },
      {
        name: `${slugify(output.name)}-metadata.json`,
        kind: "json",
        mime: "application/json",
        content: JSON.stringify({ workflow: workflow.name, output, activity: eventRows.map((event) => event.details || {}) }, null, 2),
      },
    );
  }

  for (const artifact of artifacts) {
    files.push(fileFromArtifactName(artifact, output, workflow, eventRows));
  }

  if (!opportunityAnalysisOnly && !artifacts.some((artifact) => /\.docx?$/i.test(artifact))) {
    files.push({
      name: `${slugify(output.name)}-review-notes.docx`,
      kind: "word",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: outputReviewNotes(workflow, output, eventRows),
    });
  }

  if (!opportunityAnalysisOnly && !artifacts.some((artifact) => /\.xlsx?$/i.test(artifact))) {
    files.push({
      name: `${slugify(output.name)}-opportunity-table.xlsx`,
      kind: "excel",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: outputActivityCsv(eventRows),
    });
  }

  return files.map((file) => ({ ...file, size: String(file.content || "").length }));
}

function isOpportunityDiscoveryWorkflow(workflow) {
  return /opportunity/i.test(`${workflow?.name || ""} ${workflow?.objective || ""}`);
}

function isModelAnalysisDocument(document) {
  return /^model-analysis\.md$/i.test(document?.name || "");
}

function outputRelatesToEvent(output, event) {
  const text = normalizeMatchText(`${event.details?.summary || ""} ${event.details?.message || ""} ${(event.details?.artifacts || []).join(" ")} ${(event.details?.documents || []).map((document) => document.name).join(" ")}`);
  return textMentions(text, output.name) || (event.details?.outputs || []).some((item) => sameName(item.name, output.name)) || event.type === "AgentReport";
}

function outputMarkdownSummary(workflow, output, events) {
  const lines = [
    `# ${output.name}`,
    "",
    `Workflow: ${workflow.name}`,
    `Status: ${titleize(output.status || "reported")}`,
    `Type: ${output.type || "Output"}`,
    "",
    "## Latest Activity",
    ...(events.length ? events.slice(0, 8).map((event) => `- ${formatTimestamp(event.timestamp)}: ${event.details?.summary || humanEventLabel(event)}`) : ["- No activity details reported yet."]),
  ];
  return lines.join("\n");
}

function outputReviewNotes(workflow, output, events) {
  return [
    `${output.name}`,
    "",
    `Workflow: ${workflow.name}`,
    `Review status: ${titleize(output.status || workflow.status || "reported")}`,
    "",
    "Notes",
    events.map((event) => `- ${event.details?.summary || humanEventLabel(event)}`).join("\n") || "- Awaiting agent output details.",
  ].join("\n");
}

function outputActivityCsv(events) {
  const rows = [["time", "event_type", "agent", "summary"]];
  for (const event of events.length ? events : []) {
    rows.push([
      csvCell(formatTimestamp(event.timestamp)),
      csvCell(event.type || "Event"),
      csvCell(event.details?.agent_name || "Atlas"),
      csvCell(event.details?.summary || humanEventLabel(event)),
    ]);
  }
  if (rows.length === 1) {
    rows.push(["", "No activity", "", "No output activity has been reported yet."]);
  }
  return rows.map((row) => row.join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value || "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function fileFromArtifactName(name, output, workflow, events) {
  const extension = fileExtension(name);
  const kind = fileKind(extension);
  return {
    name,
    kind,
    mime: fileMime(kind),
    content: artifactPreviewContent(name, kind, output, workflow, events),
  };
}

function fileFromDocument(document, output, workflow, events) {
  const name = document.name || `${slugify(output.name)}-document.txt`;
  const kind = document.type && document.type !== "document" ? fileKind(document.type) : fileKind(fileExtension(name) || mimeExtension(document.mime_type));
  const content = document.content || (document.data ? JSON.stringify(document.data, null, 2) : artifactPreviewContent(name, kind, output, workflow, events));
  return {
    name,
    kind,
    mime: document.mime_type || fileMime(kind),
    url: document.url || "",
    content,
  };
}

function dedupeDocumentFiles(documents) {
  const seen = new Set();
  return documents.filter((document) => {
    if (isDeprecatedOpportunityShortlistName(document?.name)) {
      return false;
    }
    const key = `${document?.name || ""}::${document?.url || ""}::${document?.mime_type || ""}`.toLowerCase();
    if (!document?.name || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isDeprecatedOpportunityShortlistName(name = "") {
  return /^opportunity[-\s]shortlist(?:\.(?:md|json|csv))?$/i.test(String(name).trim());
}

function artifactPreviewContent(name, kind, output, workflow, events) {
  if (kind === "csv") {
    return outputActivityCsv(events);
  }
  if (kind === "json") {
    return JSON.stringify({ artifact: name, output, workflow: workflow.name, events: events.map((event) => event.details || {}) }, null, 2);
  }
  return [
    `${name}`,
    "",
    `Output: ${output.name}`,
    `Workflow: ${workflow.name}`,
    "",
    events.map((event) => event.details?.summary || humanEventLabel(event)).filter(Boolean).join("\n") || "Preview content will appear here when the agent stores this artifact as a file.",
  ].join("\n");
}

function fileExtension(name) {
  return String(name || "").split(".").pop()?.toLowerCase() || "";
}

function fileKind(extension) {
  const normalized = String(extension || "").toLowerCase().replace(/^\./, "");
  if (normalized === "csv") return "csv";
  if (["xls", "xlsx", "excel", "spreadsheet"].includes(normalized)) return "excel";
  if (["doc", "docx", "word", "document"].includes(normalized)) return "word";
  if (["md", "markdown"].includes(normalized)) return "markdown";
  if (normalized === "json") return "json";
  return "text";
}

function mimeExtension(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("csv")) return "csv";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  if (mime.includes("wordprocessing") || mime.includes("msword")) return "docx";
  if (mime.includes("markdown")) return "md";
  if (mime.includes("json")) return "json";
  return "txt";
}

function fileMime(kind) {
  return {
    csv: "text/csv",
    excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    markdown: "text/markdown",
    json: "application/json",
    text: "text/plain",
  }[kind] || "text/plain";
}

function ActivityFeedPanel({ workflow }) {
  const activity = currentWorkflowActivity(workflow);
  return (
    <WorkflowPanel id="activity">
      <WorkflowPanelHeader title="Activity Feed" icon="radio" count={activity.length} />
      <AtlasScrollArea className="max-h-[420px]" viewportClassName="overflow-x-hidden p-2">
        <ol>
        {activity.length ? activity.map((event, index) => <WorkflowActivityFeedRow event={event} isLast={index === activity.length - 1} key={`${event.timestamp}-${index}`} />) : <li className="p-2"><EmptyState label="No current run activity." /></li>}
        </ol>
      </AtlasScrollArea>
    </WorkflowPanel>
  );
}

function currentWorkflowActivity(workflow) {
  const events = Array.isArray(workflow.activity) ? workflow.activity : [];
  if (!events.length) {
    return [];
  }
  const newest = events[0];
  if (newest.details?.command_intent?.source === "atlas-trigger") {
    return [newest];
  }
  const newestRunKey = workflowEventRunKey(newest);
  if (newestRunKey) {
    return events.filter((event) => workflowEventRunKey(event) === newestRunKey).slice(0, 12);
  }
  const newestRunName = newest.details?.run_name;
  if (newestRunName) {
    return events.filter((event) => event.details?.run_name === newestRunName).slice(0, 12);
  }
  const newestReportId = newest.details?.report_id;
  if (newestReportId) {
    return events.filter((event) => event.details?.report_id === newestReportId).slice(0, 12);
  }
  return events.slice(0, 3);
}

function workflowEventRunKey(event) {
  const details = event?.details || {};
  const nestedEvents = Array.isArray(details.events) ? details.events : [];
  const nestedScanId = nestedEvents.find((nested) => nested?.details?.scan_id)?.details?.scan_id;
  const scanId = details.scan_id || details.metrics?.scan_id || details.workflow_run_id || nestedScanId;
  if (scanId) {
    return `scan:${scanId}`;
  }
  return "";
}

function WorkflowActivityFeedRow({ event, isLast }) {
  const kind = workflowActivityKind(event);
  return (
    <li className="relative flex min-w-0 gap-3 overflow-hidden px-2 py-2.5">
      {!isLast && <span className="absolute left-[19px] top-8 h-[calc(100%-16px)] w-px bg-zinc-200" />}
      <div className="z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white">
        <WorkflowIcon name={kind.icon} className={`h-3.5 w-3.5 ${kind.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs leading-snug">
          <span className="font-medium text-zinc-950">{event.details?.agent_name || event.agent_name || "Atlas"}</span>{" "}
          <span className="text-zinc-500">{humanEventLabel(event).toLowerCase()}</span>
        </p>
        <p className="mt-0.5 break-words text-xs leading-snug text-zinc-500">{event.details?.summary || event.summary || "Workflow updated."}</p>
        <span className="mt-1 block font-mono text-[10px] text-zinc-400">{formatTimestamp(event.timestamp)}</span>
      </div>
    </li>
  );
}

function WorkflowPanel({ children, className = "", id }) {
  return <section className={`min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white/70 shadow-sm ${className}`} id={id}>{children}</section>;
}

function WorkflowPanelHeader({ title, icon, action, count }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
      <div className="flex items-center gap-2">
        {icon && <WorkflowIcon name={icon} className="h-4 w-4 text-zinc-500" />}
        <h2 className="text-sm font-semibold tracking-tight text-zinc-950">{title}</h2>
        {count !== undefined && <span className="rounded-full border border-zinc-200 bg-zinc-100/80 px-1.5 font-mono text-[11px] text-zinc-500">{count}</span>}
      </div>
      {action}
    </div>
  );
}

function WorkflowStat({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2">
      <div className="font-mono text-lg font-semibold tabular-nums text-zinc-950">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

function WorkflowStatusBadge({ children, status, pulse = false }) {
  const tone = workflowTone(status);
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone.badge}`}>
      {pulse && <span className="relative flex h-1.5 w-1.5"><span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-50`} /><span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} /></span>}
      {children}
    </span>
  );
}

function WorkflowIcon({ name, className = "h-4 w-4" }) {
  const paths = {
    checks: (
      <>
        <path d="M8 6h11" />
        <path d="M8 12h11" />
        <path d="M8 18h11" />
        <path d="m3.5 6 1 1 2-2" />
        <path d="m3.5 12 1 1 2-2" />
        <path d="m3.5 18 1 1 2-2" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
        <path d="M4 13l2.5 5h11L20 13h-5l-1.5 2h-3L9 13H4z" />
      </>
    ),
    handoff: (
      <>
        <path d="M7 7h11" />
        <path d="m15 4 3 3-3 3" />
        <path d="M17 17H6" />
        <path d="m9 14-3 3 3 3" />
      </>
    ),
    output: (
      <>
        <path d="M7 4h7l4 4v12H7z" />
        <path d="M14 4v4h4" />
        <path d="M10 13h5" />
        <path d="M10 16h5" />
      </>
    ),
    filter: (
      <>
        <path d="M4 5h16" />
        <path d="M7 12h10" />
        <path d="M10 19h4" />
      </>
    ),
    radio: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M16 8a5.7 5.7 0 0 1 0 8" />
        <path d="M8 8a5.7 5.7 0 0 0 0 8" />
        <path d="M19 5a10 10 0 0 1 0 14" />
        <path d="M5 5a10 10 0 0 0 0 14" />
      </>
    ),
    zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </>
    ),
    ellipsis: (
      <>
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="19" cy="12" r="1.5" />
      </>
    ),
    chat: (
      <>
        <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
        <path d="M8 10h8" />
        <path d="M8 13h5" />
      </>
    ),
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M5 7l1.2 12h11.6L19 7" />
        <path d="M8 4h8l1 3H7l1-3z" />
        <path d="M10 12h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="18" r="2" />
        <circle cx="6" cy="18" r="2" />
        <path d="M8 6h3a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3" />
        <path d="M8 18h8" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
    bot: (
      <>
        <rect x="5" y="8" width="14" height="10" rx="3" />
        <path d="M12 8V4" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
        <path d="M10 17h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    loader: (
      <>
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m5.6 5.6 2.1 2.1" />
        <path d="m16.3 16.3 2.1 2.1" />
      </>
    ),
    circle: <circle cx="12" cy="12" r="6" />,
    alert: (
      <>
        <path d="M12 4 3 20h18L12 4z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
    hand: (
      <>
        <path d="M7 11V6a1.5 1.5 0 0 1 3 0v5" />
        <path d="M10 10V5a1.5 1.5 0 0 1 3 0v6" />
        <path d="M13 11V7a1.5 1.5 0 0 1 3 0v6" />
        <path d="M16 12v-1a1.5 1.5 0 0 1 3 0v2a7 7 0 0 1-7 7h-1a6 6 0 0 1-5.4-3.4L4 13a1.6 1.6 0 0 1 2.8-1.5L8 13" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </>
    ),
  };

  return (
    <svg className={`${className} fill-none stroke-current stroke-[1.8]`} aria-hidden="true" viewBox="0 0 24 24">
      {paths[name] || paths.info}
    </svg>
  );
}

function ObjectDetailView({ object, onCreateWorkflowFromAgent, onDeleteRegisteredAgent, onOpenAgents, onOpenObject, registryActionsEnabled = false }) {
  const [deleteStatus, setDeleteStatus] = useState("idle");
  const [deleteError, setDeleteError] = useState("");
  const [createWorkflowStatus, setCreateWorkflowStatus] = useState("idle");
  const [workflowSheetOpen, setWorkflowSheetOpen] = useState(false);
  const [workflowSetup, setWorkflowSetup] = useState(() => workflowSetupFromAgent(object));
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef(null);
  const showRegistryMenu = registryActionsEnabled && object.type === "Agent";

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function closeMenu(event) {
      if (menuButtonRef.current?.contains(event.target)) {
        return;
      }
      setMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuOpen]);

  function toggleAgentMenu() {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, rect.right - 176),
      });
    }
    setMenuOpen((open) => !open);
  }

  async function handleDeleteAgent() {
    const agentId = object.agent_id || object.id || object.name;
    if (!agentId || deleteStatus === "deleting") {
      return;
    }
    setDeleteStatus("deleting");
    setDeleteError("");
    try {
      await onDeleteRegisteredAgent?.(agentId);
      setMenuOpen(false);
      onOpenAgents?.();
    } catch (error) {
      setDeleteError(error.message || "Agent delete failed.");
      setDeleteStatus("idle");
    }
  }

  async function latestRegisteredAgentForObject() {
    const agentId = object.agent_id || object.id || object.name;
    try {
      const response = await fetch("/api/agents");
      const payload = await parseApiJson(response);
      if (!response.ok) {
        throw new Error(payload.error || "Could not load latest agent contract.");
      }
      const agents = Array.isArray(payload.agents) ? payload.agents : [];
      saveRegisteredAgents(agents);
      return agents.find((agent) => (
        sameName(agent.id, agentId) ||
        sameName(agent.agent_id, agentId) ||
        sameName(agent.agent_name, object.agent_name || object.name) ||
        sameName(agent.name, object.name)
      )) || object;
    } catch (error) {
      setDeleteError(error.message || "Could not load latest agent contract.");
      return object;
    }
  }

  async function openCreateWorkflowSheet() {
    const latestAgent = await latestRegisteredAgentForObject();
    const nextSetup = workflowSetupFromAgent(latestAgent);
    setWorkflowSetup(nextSetup);
    setWorkflowSheetOpen(true);
    setMenuOpen(false);
  }

  useEffect(() => {
    setWorkflowSetup(workflowSetupFromAgent(object));
  }, [object.id, object.agent_id, object.name]);

  useEffect(() => {
    if (!workflowSheetOpen) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [workflowSheetOpen]);

  function handleCreateWorkflow(event) {
    event?.preventDefault();
    if (createWorkflowStatus === "creating") {
      return;
    }
    setCreateWorkflowStatus("creating");
    setDeleteError("");
    try {
      onCreateWorkflowFromAgent?.({ ...object, workflow_setup: workflowSetup });
      setWorkflowSheetOpen(false);
      setMenuOpen(false);
    } catch (error) {
      setDeleteError(error.message || "Workflow creation failed.");
      setCreateWorkflowStatus("idle");
    }
  }

  return (
    <section className="grid w-full min-w-0 gap-4 overflow-hidden">
      <div className="min-w-0 overflow-hidden border-b border-zinc-200 bg-white/50 px-4 py-4 shadow-sm ring-1 ring-zinc-200/70 lg:px-5" id="overview">
        <Breadcrumb items={object.breadcrumb} onOpenAgents={onOpenAgents} onOpenObject={onOpenObject} />
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h2 className="min-w-0 max-w-full truncate text-xl font-semibold tracking-[-0.025em] text-zinc-950">{object.name}</h2>
              <WorkflowStatusBadge status={object.status} pulse>{object.status}</WorkflowStatusBadge>
              <span className="max-w-full truncate font-mono text-xs text-zinc-400">{object.type}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <WorkflowMeta icon="branch" label="Type" value={object.type || "Object"} />
              <WorkflowMeta icon="user" label="People" value={String(object.people.length)} />
              <WorkflowMeta icon="checks" label="Actions" value={String(object.openActions.length)} />
              <WorkflowMeta icon="clock" label="Updated" value={object.timeline[0]?.timestamp ? formatTimestamp(object.timeline[0].timestamp) : "none"} />
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {[...object.people, ...object.systems, ...object.projects].slice(0, 4).map((item) => <EntityChip entity={item} key={`${item.type}-${item.name}`} onClick={onOpenObject} />)}
            {showRegistryMenu && (
              <>
                <button
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950"
                  onClick={toggleAgentMenu}
                  ref={menuButtonRef}
                  title="Agent actions"
                  type="button"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && createPortal(
	                  <div
	                    className="fixed z-[2147483647] w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-2xl ring-1 ring-zinc-950/10"
	                    onPointerDown={(event) => event.stopPropagation()}
	                    role="menu"
	                    style={{ top: menuPosition.top, left: menuPosition.left }}
		                  >
		                    <button
		                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
		                      disabled={createWorkflowStatus === "creating"}
		                      onClick={openCreateWorkflowSheet}
		                      role="menuitem"
		                      type="button"
		                    >
		                      <Plus className="h-4 w-4" />
		                      Create workflow
		                    </button>
	                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                      disabled={deleteStatus === "deleting"}
                      onClick={handleDeleteAgent}
                      role="menuitem"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleteStatus === "deleting" ? "Deleting..." : "Delete agent"}
                    </button>
                  </div>,
                  document.body
                )}
              </>
            )}
          </div>
        </div>
        {deleteError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{deleteError}</div>}
	      </div>
        {showRegistryMenu && (
          <Sheet open={workflowSheetOpen} onOpenChange={setWorkflowSheetOpen}>
            <SheetContent className="w-full bg-white sm:max-w-2xl" side="right">
              <AtlasScrollArea className="h-full" viewportClassName="pr-2">
                <SheetHeader className="pr-8">
                  <SheetTitle>Create Workflow From Agent</SheetTitle>
                  <SheetDescription>
                    Review the trigger, stages, and output expectations before Atlas creates the workflow.
                  </SheetDescription>
                </SheetHeader>
                <AgentWorkflowSetupForm
                  agent={object}
                  form={workflowSetup}
                  setForm={setWorkflowSetup}
                  status={createWorkflowStatus}
                  onSubmit={handleCreateWorkflow}
                />
              </AtlasScrollArea>
            </SheetContent>
          </Sheet>
        )}

      <WorkflowPanel>
        <WorkflowPanelHeader title="Status Summary" icon="info" action={<WorkflowStatusBadge status={object.status}>{object.status}</WorkflowStatusBadge>} />
        <div className="grid gap-3 p-4">
          <p className="break-words text-sm leading-6 text-zinc-700">{object.currentTruth || object.summary}</p>
          {object.summary && object.summary !== object.currentTruth && <p className="break-words text-xs leading-5 text-zinc-500">{object.summary}</p>}
        </div>
      </WorkflowPanel>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4 overflow-hidden">
          <OperatorObjectContext object={object} onOpenObject={onOpenObject} />
          <ObjectListPanel title="Open Actions" rows={object.openActions} kind="actions" icon="checks" />
          <ObjectListPanel title="Recent Changes" rows={object.recentChanges} kind="activity" icon="radio" />
        </div>
        <div className="grid min-w-0 gap-4 overflow-hidden">
          <ObjectChipsPanel title="People" items={object.people} onOpenObject={onOpenObject} icon="user" />
          <ObjectChipsPanel title="Connected" items={object.connectedObjects} onOpenObject={onOpenObject} icon="handoff" />
          <ObjectListPanel title="Agent Activity" rows={object.agentActivity} kind="activity" icon="bot" />
        </div>
      </div>

    </section>
  );
}

function ObjectSummaryStats({ object }) {
  const stats = [
    ["People", object.people.length, "people"],
    ["Systems", object.systems.length, "systems"],
    ["Actions", object.openActions.length, "actions"],
    ["Changes", object.recentChanges.length, "changes"],
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {stats.map(([label, value, target]) => (
        <a className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-300" href={`#${target}`} key={label}>
          <span className="font-semibold text-zinc-950">{value}</span>
          <span>{label}</span>
        </a>
      ))}
    </div>
  );
}

function OperatorObjectContext({ object, onOpenObject }) {
  if (["Project", "Workflow", "Dashboard", "Report", "Process"].includes(object.type)) {
    return <ProjectOperatorContext object={object} onOpenObject={onOpenObject} />;
  }
  if (object.type === "Agent") {
    return <AgentOperatorContext object={object} onOpenObject={onOpenObject} />;
  }
  if (object.type === "Artifact") {
    return <ArtifactOperatorContext object={object} onOpenObject={onOpenObject} />;
  }
  return null;
}

function ProjectOperatorContext({ object, onOpenObject }) {
  const groups = object.operator;
  return (
    <WorkflowPanel>
      <WorkflowPanelHeader title="Project Operations" icon="branch" />
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <CompactList title="Active Agents" rows={groups.activeAgents} onOpenObject={onOpenObject} />
        <CompactList title="Recent Runs" rows={groups.recentRuns} />
        <CompactList title="Needs Review" rows={groups.needsReview} />
        <CompactList title="Completed Work" rows={groups.completedWork} />
        <CompactList title="Blocked Work" rows={groups.blockedWork} />
        <CompactList title="Artifacts Changed" rows={groups.artifactsChanged} />
      </div>
    </WorkflowPanel>
  );
}

function AgentOperatorContext({ object, onOpenObject }) {
  const groups = object.operator;
  return (
    <WorkflowPanel>
      <WorkflowPanelHeader title="Agent Operations" icon="bot" />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <CompactList title="Recent Reports" rows={groups.recentReports} />
        <CompactList title="Projects Worked On" rows={groups.projectsWorkedOn} onOpenObject={onOpenObject} />
        <CompactList title="Status" rows={groups.statusRows} />
        <CompactList title="Artifacts Changed" rows={groups.artifactsChanged} />
      </div>
    </WorkflowPanel>
  );
}

function ArtifactOperatorContext({ object, onOpenObject }) {
  const groups = object.operator;
  return (
    <WorkflowPanel>
      <WorkflowPanelHeader title="Artifact Context" icon="output" />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <CompactList title="Project" rows={groups.projectsWorkedOn} onOpenObject={onOpenObject} />
        <CompactList title="Changed By" rows={groups.activeAgents} onOpenObject={onOpenObject} />
        <CompactList title="Run" rows={groups.recentRuns} />
        <CompactList title="Last Change" rows={groups.recentReports} />
      </div>
    </WorkflowPanel>
  );
}

function CompactList({ title, rows, onOpenObject }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{title}</div>
      <div className="grid gap-1.5">
        {rows.length ? rows.slice(0, 4).map((row, index) => (
          row.clickable && onOpenObject ? (
            <button className="truncate rounded-md px-2 py-1 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950" type="button" key={`${title}-${row.name}-${index}`} onClick={() => onOpenObject(row.name)}>
              {row.name}
            </button>
          ) : (
            <div className="truncate px-2 py-1 text-sm text-zinc-700" key={`${title}-${row.name}-${index}`}>{row.name}</div>
          )
        )) : <div className="px-2 py-1 text-sm text-zinc-400">Clear</div>}
      </div>
    </div>
  );
}

function ObjectChipsPanel({ title, items, onOpenObject, icon }) {
  if (!items.length) {
    return null;
  }

  return (
    <WorkflowPanel>
      <WorkflowPanelHeader title={title} icon={icon} count={items.length} />
      <div className="flex flex-wrap gap-2 p-4">
        {items.map((item, index) => <EntityChip entity={item} key={`${title}-${item.name}-${index}`} onClick={onOpenObject} />)}
      </div>
    </WorkflowPanel>
  );
}

function ObjectListPanel({ title, rows, kind, icon }) {
  if (!rows.length) {
    return null;
  }

  const id = title === "Open Actions" ? "actions" : title === "Recent Changes" ? "changes" : title === "Agent Activity" ? "agent-activity" : undefined;

  return (
    <WorkflowPanel className="scroll-mt-6" id={id}>
      <WorkflowPanelHeader title={title} icon={icon} count={rows.length} />
      <div className="divide-y divide-zinc-200">
        {rows.map((row, index) => (
          kind === "activity" ? <ObjectActivityRow row={row} key={`${row.title}-${index}`} /> : <ObjectActionRow row={row} key={`${row.title}-${index}`} />
        ))}
      </div>
    </WorkflowPanel>
  );
}

function ObjectActionRow({ row }) {
  return (
    <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] gap-3 p-4">
      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
        <WorkflowIcon name="alert" className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-950">{row.title}</div>
        {row.detail && <p className="mt-0.5 break-words text-xs leading-5 text-zinc-500">{row.detail}</p>}
      </div>
    </div>
  );
}

function ObjectActivityRow({ row }) {
  return (
    <details className="group min-w-0 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-950">{row.title}</div>
          {row.detail && <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{row.detail}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.time && <span className="text-xs text-zinc-400">{row.time}</span>}
          <ChevronIcon className="h-3.5 w-3.5 text-zinc-300 transition group-open:rotate-90" />
        </div>
      </summary>
      {row.detail && <div className="mt-2 break-words text-xs leading-5 text-zinc-500">{row.detail}</div>}
      {row.artifacts?.length ? (
        <div className="mt-2 grid gap-1.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Artifacts changed</div>
          <div className="flex flex-wrap gap-1.5">
            {row.artifacts.map((artifact) => (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500" key={artifact}>{artifact}</span>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}

function Breadcrumb({ items, onOpenAgents, onOpenObject, onOpenWorkflows }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
      {items.map((item, index) => (
        <React.Fragment key={`${item.name}-${index}`}>
          {index > 0 && <span>/</span>}
          {item.clickable ? (
            <button
              className="cursor-pointer rounded-sm underline-offset-2 transition hover:text-zinc-900 hover:underline focus:outline-none focus:ring-2 focus:ring-zinc-300"
              type="button"
              onClick={() => {
                if (item.action === "workflows") {
                  onOpenWorkflows?.();
                  return;
                }
                if (item.action === "agents") {
                  onOpenAgents?.();
                  return;
                }
                onOpenObject(item.name);
              }}
            >
              {item.name}
            </button>
          ) : (
            <span className={index === items.length - 1 ? "text-zinc-700" : ""}>{item.name}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ChipSection({ title, items, onOpenObject }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="scroll-mt-6" id={sectionIdForTitle(title)}>
      <SectionHeader title={title} />
      <div className="flex flex-wrap gap-2">
        {items.length ? items.map((item, index) => <EntityChip entity={item} key={`${item.name}-${index}`} onClick={onOpenObject} />) : <EmptyState label="None yet." />}
      </div>
    </section>
  );
}

function ObjectListSection({ title, rows, kind }) {
  if (!rows.length) {
    return null;
  }

  const id = title === "Open Actions" ? "actions" : title === "Recent Changes" ? "changes" : title === "Agent Activity" ? "agent-activity" : undefined;

  return (
    <section id={id}>
      <SectionHeader title={title} />
      <div>
        {rows.map((row, index) => (
          kind === "activity" ? <ActivityListRow row={row} key={`${row.title}-${index}`} /> : <ActionListRow row={row} key={`${row.title}-${index}`} />
        ))}
      </div>
    </section>
  );
}

function ActionListRow({ row }) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 border-t border-zinc-200 py-2.5 first:border-t-0">
      <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-500" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-950">{row.title}</div>
        {row.detail && <ExpandableText text={row.detail} className="mt-0.5 text-xs leading-5 text-zinc-500" compact />}
      </div>
    </div>
  );
}

function ActivityListRow({ row }) {
  return (
    <details className="group border-t border-zinc-200 py-2.5 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300">
        <div className="min-w-0 truncate text-sm font-medium text-zinc-950">{row.title}</div>
        <div className="flex shrink-0 items-center gap-2">
          {row.time && <span className="text-xs text-zinc-400">{row.time}</span>}
          <ChevronIcon className="h-3.5 w-3.5 text-zinc-300 transition group-open:rotate-90" />
        </div>
      </summary>
      {row.detail && <div className="mt-1 text-xs leading-5 text-zinc-500">{row.detail}</div>}
      {row.artifacts?.length ? (
        <div className="mt-2 grid gap-1.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">Artifacts changed</div>
          <div className="flex flex-wrap gap-1.5">
            {row.artifacts.map((artifact) => (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500" key={artifact}>{artifact}</span>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}

function ConnectedNetwork({ object, onOpenObject }) {
  if (!object.relationshipGroups.length) {
    return null;
  }

  return (
    <section className="scroll-mt-6" id="related-objects">
      <SectionHeader title="Connected Network" />
      <div className="grid gap-2">
        {object.relationshipGroups.map((group) => (
          <details className="group border-t border-zinc-200 py-2 first:border-t-0" key={group.label}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">{group.label}</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{group.objects.length}</span>
                <ChevronIcon className="h-3.5 w-3.5 text-zinc-300 transition group-open:rotate-90" />
              </div>
            </summary>
            <div className="mt-2">
              <div className="flex flex-wrap gap-1.5">
                {group.objects.map((item) => <EntityChip entity={item} key={`${group.label}-${item.name}`} onClick={onOpenObject} />)}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function sectionIdForTitle(title) {
  const ids = {
    People: "people",
    Systems: "systems",
    Agents: "agents",
    Artifacts: "artifacts",
  };
  return ids[title] || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function StatusPill({ status, prominent = false }) {
  const styles = {
    Active: "bg-emerald-50 text-emerald-700",
    "Needs Attention": "bg-amber-50 text-amber-700",
    Blocked: "bg-red-50 text-red-700",
    Waiting: "bg-zinc-100 text-zinc-600",
    Complete: "bg-blue-50 text-blue-700",
  };
  return <span className={`w-fit rounded-full font-medium ${prominent ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"} ${styles[status] || styles.Waiting}`}>{status}</span>;
}

function ExpandableText({ text, className = "", compact = false }) {
  const value = String(text || "");
  const shouldCollapse = value.length > (compact ? 120 : 180);
  if (!shouldCollapse) {
    return <p className={className}>{value}</p>;
  }

  return (
    <details className="group">
      <summary className={`${className} cursor-pointer list-none`}>
        <span className="line-clamp-2">{value}</span>
        <span className="mt-1 inline-flex text-xs font-medium text-zinc-500 group-open:hidden">Show details</span>
      </summary>
      <p className={`${className} mt-1`}>{value}</p>
    </details>
  );
}

function PreviewColumn({ title, rows, renderRow }) {
  return (
    <div className="min-h-0">
      <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{title}</div>
      <div>
        {rows.length ? rows.map((row, index) => <div key={row.id || `${title}-${index}`}>{renderRow(row)}</div>) : <EmptyState label={`No ${title.toLowerCase()} yet.`} />}
      </div>
    </div>
  );
}

function RecordsView({ title, description, rows, renderRow }) {
  return (
    <section>
      <SectionHeader title={title} description={description} />
      <div>
        {rows.length ? rows.map((row, index) => <div key={row.id || `${title}-${index}`}>{renderRow(row)}</div>) : <EmptyState label={`No ${title.toLowerCase()} yet.`} />}
      </div>
    </section>
  );
}

function TimelineView({ query, queryAnswer, onQuery, onQueryChange, world }) {
  const suggestions = [
    "What did agents do today?",
    "What needs attention?",
    "Which agents worked on Atlas?",
    "What projects are blocked?",
    "What changed since yesterday?",
  ];

  return (
    <div className="grid gap-6">
      <PageTitle title="Activity" />
      <section className="border-b border-zinc-200 pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-zinc-950">Ask about agent activity</h2>
          </div>
          <button className="h-9 rounded-lg bg-zinc-950 px-3.5 text-sm font-medium text-white hover:bg-zinc-800" type="button" onClick={onQuery}>
            Answer
          </button>
        </div>
        <input
          className="mt-4 h-10 w-full rounded-xl bg-white px-3 text-sm text-zinc-950 outline-none ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:ring-zinc-400"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onQuery();
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button className="rounded-full bg-white px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200 transition hover:bg-zinc-100" type="button" key={suggestion} onClick={() => onQueryChange(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
        <QueryAnswer answer={queryAnswer || answerQuery(query, world)} />
      </section>
      <TimelinePanel events={world.events} />
    </div>
  );
}

function QueryAnswer({ answer }) {
  const rows = String(answer || "")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);

  return (
    <section className="mt-5">
      <SectionHeader title="Answer" />
      <div>
        {rows.length ? rows.map((row, index) => {
          const [title, ...rest] = row.split(" - ");
          return (
            <div className="border-t border-zinc-200 py-3 first:border-t-0" key={`${row}-${index}`}>
              <div className="text-sm font-medium text-zinc-950">{title}</div>
              {rest.length ? <div className="mt-1 text-sm leading-6 text-zinc-500">{rest.join(" - ")}</div> : null}
            </div>
          );
        }) : <EmptyState label="Ask a question." />}
      </div>
    </section>
  );
}

function SettingsView({ agentStatus, world, onImport, onReset }) {
  const normalized = normalizeWorld(world);
  const settings = getSettingsDashboardState(normalized, agentStatus);
  const atlasEndpoint = `${globalThis.location?.origin || "$ATLAS_URL"}/api`;
  const exampleContextCurl = `curl -sS "$ATLAS_URL/api/context?project=Atlas" -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY"`;
  const exampleReportCurl = `curl -sS -X POST "$ATLAS_URL/api/report" -H "Content-Type: application/json" -H "x-atlas-api-key: $ATLAS_AGENT_API_KEY" -d '{"source":"agent","agent_id":"codex-cli","agent_name":"Codex CLI","project":"Atlas","message":"Fixed object page UI.","status":"completed","artifacts":["src/pages/ObjectDetail.tsx"],"events":[{"type":"TaskCompleted","target":"Fix object page UI"}],"confidence":0.9}'`;

  return (
    <div className="grid gap-6">
      <PageTitle title="Settings" />

      <div className="grid gap-4">
        <SettingsConnectivityPanel agentStatus={agentStatus} settings={settings} />
        <SettingsIntegrationPanel atlasEndpoint={atlasEndpoint} contextCurl={exampleContextCurl} reportCurl={exampleReportCurl} />
      </div>
    </div>
  );
}

function SettingsConnectivityPanel({ agentStatus, settings }) {
  const rows = [
    { icon: "book", label: "Read API", description: "Agents pull project context", value: "Enabled", tone: "on" },
    { icon: "send", label: "Report API", description: "Agents push state updates", value: "Enabled", tone: "on" },
    { icon: "key", label: "API key", description: "Authenticates every request", value: agentStatus?.configured ? "Configured" : "Missing", tone: agentStatus?.configured ? "on" : "muted" },
    { icon: "bot", label: "Last agent", description: "Most recent connection", value: settings.lastReportingAgent, tone: "muted" },
    { icon: "clock", label: "Last report", description: "Most recent state sync", value: settings.lastReportTimestamp, tone: "muted" },
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-950">Agent Connectivity</h2>
          <p className="truncate text-xs text-zinc-500">Live status of inbound and outbound channels</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Online
        </span>
      </div>

      <div className="divide-y divide-zinc-200 border-t border-zinc-200">
        {rows.map((row) => (
          <div className="flex items-center gap-4 px-6 py-3.5" key={row.label}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950">
              <SettingsIcon name={row.icon} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-950">{row.label}</p>
              <p className="truncate text-xs text-zinc-500">{row.description}</p>
            </div>
            <div className={`flex shrink-0 items-center gap-2 text-sm font-medium ${row.tone === "on" ? "text-zinc-950" : "text-zinc-500"}`}>
              {row.tone === "on" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              <span className="max-w-[140px] truncate">{row.value}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsIntegrationPanel({ atlasEndpoint, contextCurl, reportCurl }) {
  const [copied, setCopied] = useState(null);

  function copy(key, value) {
    copyText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm lg:col-span-2">
      <div className="flex items-center gap-2 px-6 pb-4 pt-5">
        <SettingsIcon name="terminal" className="h-4 w-4 text-zinc-500" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-950">Agent Integration</h2>
          <p className="truncate text-xs text-zinc-500">Connect any agent to this world model</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px border-y border-zinc-200 bg-zinc-200 sm:grid-cols-2">
        <SettingsField label="Endpoint" value={atlasEndpoint} mono />
        <SettingsField label="Authentication" value="x-atlas-api-key header" />
      </div>

      <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
        <SettingsCopyButton done={copied === "context"} hint="Read project context" label="Copy context curl" onClick={() => copy("context", contextCurl)} />
        <SettingsCopyButton done={copied === "report"} hint="Send agent update" label="Copy report curl" onClick={() => copy("report", reportCurl)} />
      </div>
    </section>
  );
}

function SettingsField({ label, value, mono = false }) {
  return (
    <div className="min-w-0 bg-white px-6 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 truncate text-sm text-zinc-950 ${mono ? "font-mono text-[13px]" : ""}`}>{value}</p>
    </div>
  );
}

function SettingsCopyButton({ done, hint, label, onClick }) {
  return (
    <button
      className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950 px-4 py-3 text-left text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-zinc-300"
      type="button"
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-zinc-400">{hint}</p>
      </div>
      <SettingsIcon name={done ? "check" : "copy"} className={`h-4 w-4 shrink-0 ${done ? "" : "opacity-70"}`} />
    </button>
  );
}

function SettingsIcon({ name, className = "h-4 w-4" }) {
  const paths = {
    book: (
      <>
        <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z" />
        <path d="M5 4.5v17" />
        <path d="M9 6h7" />
      </>
    ),
    send: (
      <>
        <path d="M21 3 10 14" />
        <path d="m21 3-7 18-4-7-7-4z" />
      </>
    ),
    key: (
      <>
        <circle cx="7.5" cy="12.5" r="3.5" />
        <path d="M11 12.5h10" />
        <path d="M17 12.5v3" />
        <path d="M20 12.5v2" />
      </>
    ),
    bot: (
      <>
        <rect x="5" y="8" width="14" height="10" rx="3" />
        <path d="M12 8V4" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
        <path d="M10 17h4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    terminal: (
      <>
        <path d="m5 7 5 5-5 5" />
        <path d="M12 17h7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 15V3" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 21h14" />
      </>
    ),
    reset: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 4v6h6" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
  };

  return (
    <svg className={`${className} fill-none stroke-current stroke-[1.8]`} aria-hidden="true" viewBox="0 0 24 24">
      {paths[name] || paths.bot}
    </svg>
  );
}

function SettingsPanel({ title, children, className = "" }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/80 ${className}`}>
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

function MetricTile({ label, value, compact = false, tone = "default" }) {
  const valueClass = compact ? "text-sm" : "text-[22px]";
  const toneClass = tone === "attention" ? "text-zinc-950" : "text-zinc-950";

  return (
    <div className="rounded-xl bg-zinc-50 px-3.5 py-3 ring-1 ring-zinc-200/70">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</div>
      <div className={`mt-2 truncate font-semibold tracking-[-0.02em] ${valueClass} ${toneClass}`}>{value}</div>
    </div>
  );
}

function ConnectivityRow({ label, value, status = "neutral" }) {
  const dotClass = status === "ok" ? "bg-zinc-950" : status === "warn" ? "bg-zinc-400" : "bg-zinc-300";

  return (
    <div className="flex items-center justify-between gap-4 border-t border-zinc-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <span className="text-sm text-zinc-500">{label}</span>
      </div>
      <span className="max-w-[52%] truncate text-right text-sm font-medium text-zinc-950">{value}</span>
    </div>
  );
}

function IntegrationTile({ label, value }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200/70">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</div>
      <div className="mt-2 truncate text-sm font-medium text-zinc-950">{value}</div>
    </div>
  );
}

function getSettingsDashboardState(world, agentStatus) {
  const agentEvents = world.events.filter((event) => event.details?.source === "agent" || event.type === "AgentReport");
  const agentNames = new Set([
    ...world.entities.filter((entity) => entity.type === "Agent").map((entity) => entity.name),
    ...agentEvents.map((event) => event.details?.agent_name).filter(Boolean),
  ]);
  const reportsToday = agentEvents.filter((event) => isToday(event.timestamp)).length;
  const openWorkItems = world.events.filter((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type)).length;
  const lastAgentEvent = agentEvents.at(-1);
  const lastReportTimestamp = agentStatus?.lastReceivedAt || lastAgentEvent?.timestamp || "";
  const healthStatus = agentStatus?.configured === false || openWorkItems > 0 ? "Needs attention" : "Healthy";

  return {
    healthStatus,
    agentsConnected: agentNames.size,
    reportsToday,
    openWorkItems,
    lastUpdate: formatLastUpdate(world.events),
    lastReportingAgent: lastAgentEvent?.details?.agent_name || "None",
    lastReportTimestamp: lastReportTimestamp ? formatTimestamp(lastReportTimestamp) : "None",
  };
}

function isToday(timestamp) {
  if (!timestamp) {
    return false;
  }

  const date = new Date(timestamp);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function StatLine({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-zinc-900">{value}</div>
    </div>
  );
}

function PageTitle({ title }) {
  return <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-zinc-950">{title}</h1>;
}

function SectionHeader({ title, description }) {
  return (
    <div className="pb-3">
      <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">{title}</h2>
      {description && <p className="mt-1 text-sm text-zinc-600">{description}</p>}
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="py-2 text-sm text-zinc-700">{label}</div>;
}

function renderEntityCard(entity) {
  return (
    <div className="border-t border-zinc-200 py-2 first:border-t-0">
      <div className="truncate text-sm font-medium text-zinc-900">{entity.name}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{entity.type || "Unknown"}</div>
    </div>
  );
}

function renderRelationshipCard(relationship) {
  return (
    <div className="border-t border-zinc-200 py-2 first:border-t-0">
      <div className="text-xs font-medium text-zinc-500">{relationship.relation || "related_to"}</div>
      <div className="mt-0.5 line-clamp-2 text-sm leading-5 text-zinc-700">
        {relationship.source} <span className="text-zinc-400">→</span> {relationship.target}
      </div>
    </div>
  );
}

function renderDomainItem(item) {
  return (
    <div className="border-t border-zinc-200 py-2.5 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-900">{item.name}</div>
          {item.detail && <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">{item.detail}</div>}
        </div>
        {item.status && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">{item.status}</span>}
      </div>
    </div>
  );
}

function renderEventCard(event) {
  return (
    <div className="border-t border-zinc-200 py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-sm font-medium text-zinc-900">{humanEventLabel(event)}</div>
        <div className="shrink-0 text-xs text-zinc-400">{formatTimestamp(event.timestamp)}</div>
      </div>
      <div className="mt-0.5 text-sm text-zinc-500">{event.target || "World Model"}</div>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{event.details?.summary || event.details?.raw_input || "No details captured."}</p>
    </div>
  );
}

function MenuIcon({ name }) {
  const paths = {
    dashboard: (
      <>
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-4.5 4v-4A3.5 3.5 0 0 1 5 11.5z" />
        <path d="M9 8h6" />
        <path d="M9 11h3.5" />
      </>
    ),
    entities: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="16" r="3" />
        <path d="m10.5 10.5 3 3" />
      </>
    ),
    relationships: (
      <>
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="m8.5 11 7-4" />
        <path d="m8.5 13 7 4" />
      </>
    ),
    events: (
      <>
        <path d="M7 4v16" />
        <path d="M17 4v16" />
        <path d="M4 8h16" />
        <path d="M4 16h16" />
      </>
    ),
    timeline: (
      <>
        <path d="M5 6h14" />
        <path d="M5 12h10" />
        <path d="M5 18h6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m5.6 5.6 2.1 2.1" />
        <path d="m16.3 16.3 2.1 2.1" />
        <path d="m18.4 5.6-2.1 2.1" />
        <path d="m7.7 16.3-2.1 2.1" />
      </>
    ),
  };

  return (
    <svg className="h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.8]" aria-hidden="true" viewBox="0 0 24 24">
      {paths[name] || paths.dashboard}
    </svg>
  );
}

function GlobeIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={`${className} fill-none stroke-current stroke-[1.8]`} aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5s-1.1 6.2-3.2 8.5" />
      <path d="M12 3.5C9.9 5.8 8.8 8.6 8.8 12s1.1 6.2 3.2 8.5" />
    </svg>
  );
}

function ChevronIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={`${className} fill-none stroke-current stroke-[2]`} aria-hidden="true" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

async function extractWorldUpdate(rawInput) {
  const response = await fetch("/api/extract-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_input: rawInput }),
  });
  const payload = await parseApiJson(response);

  if (!response.ok) {
    throw new Error(payload.error || "Extraction API failed.");
  }

  return {
    ...normalizeExtraction(payload, rawInput),
    extractor: payload.extractor || {
      mode: "swa_function",
    },
  };
}

async function resolveWorkflowCommandIntent({ rawInput, updateText, workflow, workflows }) {
  const fallback = deterministicWorkflowCommandIntent(updateText || rawInput, workflow);
  try {
    const response = await fetch("/api/command-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_input: rawInput,
        update_text: updateText,
        workflow: workflowCommandContext(workflow),
        workflows: workflows.map(workflowCommandContext),
        canonical_states: CANONICAL_WORKFLOW_STATES,
        canonical_sequence: CANONICAL_WORKFLOW_SEQUENCE,
      }),
    });
    const payload = await parseApiJson(response);
    if (!response.ok) {
      return fallback;
    }
    return normalizeWorkflowCommandIntent(payload, fallback);
  } catch {
    return fallback;
  }
}

function workflowCommandContext(workflow) {
  return {
    name: workflow?.name || "",
    status: workflow?.status || "",
    current_stage: workflow?.currentStage || "",
    next_stage: workflow?.nextStage || "",
    stages: (workflow?.stages || []).map((stage) => ({
      name: stage.name,
      status: stage.status,
      agent: stage.agent,
    })),
  };
}

function mergeWorld(currentWorld, extraction) {
  const world = normalizeWorld(currentWorld);
  const normalized = applyObjectHierarchy(normalizeExtraction(extraction));
  const entities = [...world.entities];
  const relationships = [...world.relationships];
  const events = [...world.events];

  for (const entity of normalized.entities) {
    const existing = entities.find((item) => entityKey(item) === entityKey(entity));
    if (!existing) {
      entities.push({ ...entity, id: entity.id || `entity_${pad(entities.length + 1)}` });
    } else {
      Object.assign(existing, { ...entity, id: existing.id });
    }
  }

  for (const relationship of normalized.relationships) {
    if (!relationships.some((item) => relationshipKey(item) === relationshipKey(relationship))) {
      relationships.push(relationship);
    }
  }

  return {
    entities,
    relationships,
    events: [...events, ...normalized.events],
  };
}

function refreshExtractionTimestamps(extraction) {
  const timestamp = new Date().toISOString();
  return {
    ...extraction,
    events: (extraction.events || []).map((event) => ({ ...event, timestamp })),
  };
}

function resolveObjectSelectionName(name, world) {
  const normalized = normalizeWorld(world);
  const exactAgents = normalized.entities.filter((entity) => entity.type === "Agent" && sameName(entity.name, name));
  if (exactAgents.length) {
    return exactAgents[0].name;
  }
  const registeredAgent = findRegisteredAgentObject(name);
  if (registeredAgent) {
    return registeredAgent.name;
  }
  const exactObjects = normalized.entities.filter((entity) => sameName(entity.name, name));
  const nonWorkflow = exactObjects.find((entity) => entity.type !== "Workflow" && entity.type !== "Project");
  return (nonWorkflow || exactObjects[0])?.name || name;
}

function getPrimaryObject(world, lastExtraction) {
  const normalized = normalizeWorld(world);
  const extracted = normalizeExtraction(lastExtraction || {});
  const candidates = [...extracted.entities, ...normalized.entities].filter((entity) => !isFirstPersonEntity(entity));
  const primary =
    candidates.find((entity) => isPromotedObjectType(entity.type)) ||
    candidates.find((entity) => ["WorkItem"].includes(entity.type)) ||
    candidates.find((entity) => ["System", "Application", "DataSource", "Dataset", "Process"].includes(entity.type)) ||
    candidates[0];
  const latestEvents = normalized.events
    .filter((event) => !primary?.name || sameName(event.target, primary.name) || String(event.details?.summary || "").toLowerCase().includes(primary.name.toLowerCase()))
    .slice(-5)
    .reverse();
  const latestRelationships = normalized.relationships.filter(
    (relationship) => primary?.name && (sameName(relationship.source, primary.name) || sameName(relationship.target, primary.name)),
  );
  const attentionEvents = latestEvents.filter((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type));
  const relatedPeople = normalized.entities
    .filter((entity) => entity.type === "Person" && !isFirstPersonEntity(entity))
    .filter((entity) =>
      latestRelationships.some((relationship) => sameName(relationship.source, entity.name) || sameName(relationship.target, entity.name)) ||
      latestEvents.some((event) => String(event.details?.summary || event.details?.raw_input || "").toLowerCase().includes(entity.name.toLowerCase())),
    );

  if (!primary) {
    return {
      name: "No object yet",
      type: "Atlas is waiting for a first update",
      status: "Listening",
      truths: ["Say what changed to create the first object."],
      attention: [],
    };
  }

  return {
    name: primary.name,
    type: primary.type || "Object",
    status: attentionEvents.length ? "Needs attention" : "Active",
    truths: [
      ...latestEvents.slice(0, 3).map((event) => `${humanEventLabel(event)}: ${event.target || primary.name}`),
      ...relatedPeople.slice(0, 3).map((entity) => `${entity.name} is involved`),
    ].slice(0, 5),
    attention: attentionEvents.length
      ? attentionEvents.slice(0, 4).map((event) => event.details?.summary || `${humanEventLabel(event)}: ${event.target || primary.name}`)
      : latestRelationships.slice(0, 3).map((relationship) => `${relationship.source} ${humanRelationLabel(relationship.relation)} ${relationship.target}`),
  };
}

function getObjectDetail(name, world, root = "") {
  const normalized = normalizeWorld(world);
  const registeredAgentObject = findRegisteredAgentObject(name);
  const object =
    (root === "agents" ? registeredAgentObject : null) ||
    normalized.entities.find((entity) => sameName(entity.name, name) && entity.type === "Workflow") ||
    normalized.entities.find((entity) => sameName(entity.name, name)) ||
    registeredAgentObject ||
    findImplicitWorkflowAgent(name, normalized) ||
    normalized.entities.find((entity) => isPromotedObjectType(entity.type));

  if (!object) {
    return {
      name: name || "No workflow selected",
      type: "Object",
      status: "Waiting",
      summary: "Atlas is waiting for related changes.",
      people: [],
      systems: [],
      projects: [],
      changeChips: [],
      openActions: [],
      agentActivity: [],
      recentChanges: [],
      timeline: [],
      relatedObjects: [],
      breadcrumb: [{ name: "Workflows" }, { name: name || "No workflow selected" }],
      currentTruth: "Atlas is waiting for related changes.",
      operator: emptyOperatorContext(),
    };
  }

  const relationships = normalized.relationships.filter((relationship) => sameName(relationship.source, object.name) || sameName(relationship.target, object.name));
  const timeline = normalized.events
    .filter((event) => sameName(event.target, object.name) || String(event.details?.summary || event.details?.raw_input || "").toLowerCase().includes(object.name.toLowerCase()))
    .slice(-8)
    .reverse();
  const relatedNames = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]).filter((item) => !sameName(item, object.name)));
  const relatedEntities = normalized.entities
    .filter((entity) => !isFirstPersonEntity(entity))
    .filter((entity) => relatedNames.has(entity.name) || timeline.some((event) => String(event.details?.summary || event.details?.raw_input || "").toLowerCase().includes(entity.name.toLowerCase())));
  const uniqueRelated = dedupeByName(relatedEntities.filter((entity) => !sameName(entity.name, object.name)));
  const visibleRelated = uniqueRelated.filter((entity) => entity.visibility !== "debug");
  const people = visibleRelated.filter((entity) => entity.type === "Person");
  const systems = visibleRelated.filter((entity) => ["System", "Application", "DataSource", "Dataset"].includes(entity.type));
  const projects = uniqueRelated.filter((entity) => ["Project", "Goal", "Dashboard", "Process"].includes(entity.type));
  const relatedObjects = visibleRelated;
  const openEvents = timeline.filter((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type));
  const recentChanges = timeline.slice(0, 6).map((event) => ({ title: humanEventLabel(event), detail: compactChangeDetail(event), time: formatTimestamp(event.timestamp) }));
  const agentActivity = timeline
    .filter((event) => event.details?.source === "agent" || event.type === "AgentReport")
    .map((event) => ({ title: agentActivityTitle(event), detail: compactChangeDetail(event), time: formatTimestamp(event.timestamp), artifacts: event.details?.artifacts || [] }));
  const summary = summarizeObject(object, timeline, relationships);
  const currentTruth = currentTruthForObject(object, timeline, relationships);
  const breadcrumb = hierarchyBreadcrumbForObject(object, normalized, relatedObjects, root);
  const relationshipGroups = groupRelationshipsForObject(object, relationships, normalized.entities);
  const status = classifyObjectStatus(openEvents, timeline);
  const operator = getOperatorContext(object, normalized, relationships, timeline);

  return {
    name: object.name,
    type: object.type || "Object",
    status,
    summary,
    currentTruth,
    people,
    systems,
    projects,
    relatedObjects,
    connectedObjects: relatedObjects,
    relationshipGroups,
    changeChips: dedupeByName(timeline.map((event) => ({ name: humanEventLabel(event), type: "Change" }))).slice(0, 8),
    openActions: openEvents.map((event) => ({ title: actionTitle(event), detail: actionDetail(event) })),
    agentActivity,
    recentChanges,
    timeline,
    breadcrumb,
    operator,
  };
}

function findImplicitWorkflowAgent(name, world) {
  if (!name) {
    return null;
  }
  const workflows = getWorkflowCards(world);
  const workflow = workflows.find((item) => item.agents.some((agent) => sameName(agent, name)));
  return workflow ? { name, type: "Agent", visibility: "secondary" } : null;
}

function findRegisteredAgentObject(name) {
  if (!name) {
    return null;
  }
  const agent = loadRegisteredAgents().find((item) => (
    sameName(item.agent_name, name) ||
    sameName(item.name, name) ||
    sameName(item.agent_id, name) ||
    sameName(item.id, name)
  ));
  if (!agent) {
    return null;
  }
  return {
    id: agent.id,
    agent_id: agent.agent_id || agent.id,
    name: agent.agent_name || agent.name || agent.agent_id || agent.id,
    agent_name: agent.agent_name || agent.name || agent.agent_id || agent.id,
    type: "Agent",
    status: agent.enabled === false ? "Disabled" : agent.last_status || "Registered",
    summary: agent.description || agent.default_project || "Registered Atlas agent.",
    description: agent.description || "",
    provider: agent.provider,
    capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : commaList(agent.capabilities),
    run_endpoint: agent.run_endpoint,
    runEndpoint: agent.run_endpoint || agent.runEndpoint || "",
    control_endpoint: agent.control_endpoint,
    default_project: agent.default_project,
    default_payload: agent.default_payload || agent.defaultPayload || {},
    output_types: agent.output_types || agent.outputTypes || [],
    primary_output: agent.primary_output || agent.primaryOutput || "",
    requires_review: agent.requires_review,
    workflow_setup: agent.workflow_setup || agent.workflowSetup || {},
  };
}

function getWorkflowNavigationSections(workflow) {
  const sections = [
    { id: "overview", label: "Overview", count: 0, show: true },
    { id: "review", label: "Human Review", count: workflow.humanActions.length, show: workflow.humanActions.length > 0 },
    { id: "progress", label: "Progress", count: workflow.stages.length, show: workflow.stages.length > 0 },
    { id: "outputs", label: "Outputs", count: workflow.outputsReadyCount || 0, show: workflow.outputs.length > 0 },
  ];
  return sections.filter((section) => section.show);
}

function getObjectNavigationSections(detail) {
  const sections = [
    { id: "overview", label: "Overview", count: 0, show: true },
    { id: "people", label: "People", count: detail.people.length, show: detail.people.length > 0 },
    { id: "systems", label: "Systems", count: detail.systems.length, show: detail.systems.length > 0 },
    { id: "actions", label: "Actions", count: detail.openActions.length, show: detail.openActions.length > 0 },
    { id: "agent-activity", label: "Agent Activity", count: detail.agentActivity.length, show: detail.agentActivity.length > 0 },
    { id: "changes", label: "Changes", count: detail.recentChanges.length, show: detail.recentChanges.length > 0 },
    { id: "related-objects", label: "Connected", count: detail.relationshipGroups.length, show: detail.relationshipGroups.length > 0 },
  ];
  return sections.filter((section) => section.show);
}

function getOperatorContext(object, world, relationships, timeline) {
  const lowerObject = object.name.toLowerCase();
  const agentEvents = world.events.filter((event) =>
    event.details?.source === "agent" &&
    (sameName(event.target, object.name) ||
      sameName(event.details?.agent_name, object.name) ||
      (Array.isArray(event.details?.artifacts) && event.details.artifacts.some((artifact) => sameName(artifact, object.name))) ||
      String(event.details?.project || "").toLowerCase().includes(lowerObject))
  );
  const activeAgents = dedupeRows(agentEvents.map((event) => event.details?.agent_name).filter(Boolean).map((name) => ({ name, clickable: true })));
  const projectsWorkedOn = dedupeRows(
    [
      ...agentEvents.map((event) => event.details?.project).filter(Boolean),
      ...relationships
        .filter((relationship) => ["reported_on", "belongs_to", "run_for"].includes(relationship.relation))
        .map((relationship) => sameName(relationship.source, object.name) ? relationship.target : relationship.source),
    ].filter(Boolean).map((name) => ({ name, clickable: true }))
  );
  const recentRuns = dedupeRows(agentEvents.map((event) => ({ name: event.details?.run_name || `${event.details?.agent_name || "Agent"} run`, clickable: false })));
  const completedWork = agentEvents
    .filter((event) => event.type === "TaskCompleted" || String(event.details?.status || "").toLowerCase() === "completed")
    .map((event) => ({ name: event.details?.action_target || event.details?.summary || humanEventLabel(event), clickable: false }));
  const blockedWork = agentEvents
    .filter((event) => String(`${event.type} ${event.details?.status || ""} ${event.details?.summary || ""}`).toLowerCase().includes("block"))
    .map((event) => ({ name: event.details?.action_target || event.details?.summary || humanEventLabel(event), clickable: false }));
  const artifactsChanged = dedupeRows(agentEvents.flatMap((event) => event.details?.artifacts || []).map((name) => ({ name, clickable: false })));
  const needsReview = agentEvents
    .filter((event) => Number(event.details?.confidence || 1) < 0.8 || String(event.details?.status || "").toLowerCase().includes("review"))
    .map((event) => ({ name: event.details?.summary || humanEventLabel(event), clickable: false }));
  const recentReports = agentEvents.slice(-5).reverse().map((event) => ({ name: event.details?.summary || humanEventLabel(event), clickable: false }));
  const statusRows = [
    { name: `${completedWork.length} completed`, clickable: false },
    { name: `${blockedWork.length} blocked`, clickable: false },
  ];

  return {
    activeAgents,
    recentRuns,
    completedWork,
    blockedWork,
    artifactsChanged,
    needsReview,
    recentReports,
    projectsWorkedOn,
    statusRows,
  };
}

function emptyOperatorContext() {
  return {
    activeAgents: [],
    recentRuns: [],
    completedWork: [],
    blockedWork: [],
    artifactsChanged: [],
    needsReview: [],
    recentReports: [],
    projectsWorkedOn: [],
    statusRows: [],
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row?.name || "").toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function scrollToSection(id) {
  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function breadcrumbObjects(object, relatedObjects) {
  const parent = relatedObjects.find((entity) => isPromotedObjectType(entity.type) && !sameName(entity.name, object.name));
  return parent ? [{ name: parent.name, clickable: true }] : [];
}

function hierarchyBreadcrumbForObject(object, world, relatedObjects = [], root = "") {
  if (object.type === "Workflow") {
    return [{ name: "Workflows" }, { name: object.name }];
  }

  if (root === "agents" && object.type === "Agent") {
    return [{ name: "Agents", clickable: true, action: "agents" }, { name: object.name }];
  }

  const latestAgentEvent = latestHierarchyEventForObject(object, world);
  if (latestAgentEvent) {
    const workflowName = latestAgentEvent.details?.workflow_name || latestAgentEvent.details?.workflow?.name || latestAgentEvent.details?.project || latestAgentEvent.target || "Workflow";
    const agentName = object.type === "Agent" ? object.name : latestAgentEvent.details?.agent_name;
    const runName = latestAgentEvent.details?.run_name || (agentName ? `${agentName} run ${latestAgentEvent.timestamp}` : "");
    if (object.type === "Agent" && agentName) {
      return [
        { name: "Workflows" },
        { name: workflowName, clickable: true },
        { name: "Agents" },
        { name: agentName },
        ...(runName ? [{ name: runName }] : []),
      ];
    }
    if (object.type === "AgentRun" || sameName(object.name, runName)) {
      return [
        { name: "Workflows" },
        { name: workflowName, clickable: true },
        { name: "Agents" },
        ...(agentName ? [{ name: agentName, clickable: true }] : []),
        { name: runName || object.name },
      ];
    }
    if (object.type === "Artifact") {
      return [
        { name: "Workflows" },
        { name: workflowName, clickable: true },
        { name: "Artifacts" },
        { name: object.name },
      ];
    }
  }

  const branchLabel = objectBranchLabel(object.type);
  return [{ name: "Workflows" }, ...breadcrumbObjects(object, relatedObjects), { name: branchLabel }, { name: object.name }];
}

function latestHierarchyEventForObject(object, world) {
  const events = normalizeWorld(world).events || [];
  return [...events].reverse().find((event) => {
    const details = event.details || {};
    const runName = details.run_name || `${details.agent_name || "Agent"} run ${event.timestamp || ""}`;
    const stageAgents = (details.workflow?.stages || []).map((stage) => stage?.agent).filter(Boolean);
    if (object.type === "Agent") {
      return details.source === "agent" && (
        sameName(details.agent_name, object.name) ||
        stageAgents.some((agent) => sameName(agent, object.name))
      );
    }
    if (object.type === "Workflow") {
      return details.source === "agent" && (
        sameName(details.workflow_name, object.name) ||
        sameName(details.workflow?.name, object.name) ||
        sameName(details.project, object.name)
      );
    }
    return details.source === "agent" && (
      sameName(runName, object.name) ||
      (Array.isArray(details.artifacts) && details.artifacts.some((artifact) => sameName(artifact, object.name))) ||
      sameName(details.workflow_name, object.name)
    );
  });
}

function objectBranchLabel(type) {
  const labels = {
    Agent: "Agents",
    AgentRun: "Runs",
    Artifact: "Artifacts",
    WorkItem: "Work Items",
    Task: "Work Items",
    Action: "Actions",
    System: "Systems",
    Asset: "Assets",
    Person: "People",
  };
  return labels[type] || "Related";
}

function currentTruthForObject(object, events, relationships) {
  const actionable = events.find((event) => ["ChangeNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type));
  if (actionable) {
    return actionDetail(actionable) || changeDetail(actionable);
  }

  const latest = events[0];
  if (latest) {
    return changeDetail(latest);
  }

  if (relationships.length) {
    return `${object.name} is connected to ${relationships.map((relationship) => sameName(relationship.source, object.name) ? relationship.target : relationship.source).slice(0, 3).join(", ")}.`;
  }

  return `${object.name} is active in the world model.`;
}

function summarizeObject(object, events, relationships) {
  const summaries = events.map((event) => event.details?.summary).filter(Boolean);
  if (summaries.length) {
    return summaries[0];
  }

  if (relationships.length) {
    return `${object.name} is connected to ${relationships.map((relationship) => sameName(relationship.source, object.name) ? relationship.target : relationship.source).slice(0, 3).join(", ")}.`;
  }

  return `${object.name} is known to Atlas as ${object.type || "an object"}.`;
}

function actionTitle(event) {
  const text = `${event.target || ""} ${event.details?.summary || ""} ${event.details?.raw_input || ""}`.toLowerCase();
  if (text.includes("rollup") && text.includes("title")) {
    return "Update rollup title logic";
  }
  if ((text.includes("service now") || text.includes("servicenow")) && (text.includes("sys id") || text.includes("sysid")) && (text.includes("map") || text.includes("remap"))) {
    return "Remap ServiceNow Sys IDs";
  }
  if (text.includes("source connection") && text.includes("map")) {
    return "Remap source connection";
  }

  const label = humanEventLabel(event);
  if (event.target && !sameName(event.target, label)) {
    return event.target;
  }
  return label;
}

function actionDetail(event) {
  const text = `${event.target || ""} ${event.details?.summary || ""} ${event.details?.raw_input || ""}`;
  const lower = text.toLowerCase();
  if ((lower.includes("service now") || lower.includes("servicenow")) && (lower.includes("sys id") || lower.includes("sysid")) && lower.includes("azure cost")) {
    return "ServiceNow Sys IDs need to be remapped to the Azure Cost Source Connection because the old map is outdated.";
  }
  if (lower.includes("rollup") && lower.includes("title")) {
    return "Rollup title logic needs to be updated for the dashboard.";
  }
  return event.details?.summary || event.target || "";
}

function changeDetail(event) {
  const detail = actionDetail(event);
  if (detail) {
    return detail;
  }
  return event.details?.summary || event.target || "";
}

function compactChangeDetail(event) {
  const detail = changeDetail(event);
  const target = event.target || "";
  if (!detail) {
    return target;
  }
  if (target && sameName(detail, target)) {
    return "";
  }
  return detail.length > 110 ? `${detail.slice(0, 107).trim()}...` : detail;
}

function getOperationalState(world, lastExtraction) {
  const normalized = normalizeWorld(world);
  const latestEvent = normalized.events.at(-1);
  const currentTruth = getCurrentTruth(normalized);
  const detectedChanges = getDetectedChanges(lastExtraction);
  const attentionEvent = [...normalized.events].reverse().find((event) =>
    ["BlockerIdentified", "DependencyIdentified", "MeetingNeeded", "ChangeNeeded"].includes(event.type),
  );

  return [
    {
      label: "Changed",
      value: latestEvent ? humanEventLabel(latestEvent) : "Waiting",
      detail: latestEvent ? latestEvent.target || formatTimestamp(latestEvent.timestamp) : "No events stored",
    },
    {
      label: "Current Truth",
      value: currentTruth.value,
      detail: currentTruth.detail,
    },
    {
      label: "Attention",
      value: attentionEvent ? attentionEvent.target || humanEventLabel(attentionEvent) : "Clear",
      detail: detectedChanges.length ? `${detectedChanges.length} changes detected` : formatLastUpdate(normalized.events),
    },
  ];
}

function groupEntitiesByDomain(entities) {
  const groups = [
    { title: "People", types: ["Person"], rows: [] },
    { title: "Projects", types: ["Project", "Dashboard", "Report"], rows: [] },
    { title: "Systems", types: ["System", "Application", "DataSource", "Dataset"], rows: [] },
    { title: "Artifacts", types: ["Artifact", "Concept", "Process", "Unknown"], rows: [] },
  ];

  for (const entity of entities) {
    const group = groups.find((item) => item.types.includes(entity.type)) || groups.at(-1);
    group.rows.push(entity);
  }

  return groups.filter((group) => group.rows.length).length ? groups.filter((group) => group.rows.length) : groups.slice(0, 3);
}

function getUnderstoodGroups(extraction) {
  const normalized = normalizeExtraction(extraction || {});
  const entities = normalized.entities.filter((entity) => !isFirstPersonEntity(entity));
  return [
    {
      title: "People",
      items: entities.filter((entity) => entity.type === "Person").map((entity) => ({ ...entity, clickable: true })),
    },
    {
      title: "Projects",
      items: entities.filter((entity) => ["Project", "Dashboard", "Report"].includes(entity.type)).map((entity) => ({ ...entity, clickable: true })),
    },
    {
      title: "Systems",
      items: entities.filter((entity) => ["System", "Application", "DataSource", "Dataset"].includes(entity.type)).map((entity) => ({ ...entity, clickable: true })),
    },
    {
      title: "Actions",
      items: normalized.events
        .filter((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type))
        .map((event) => ({ name: actionTitle(event), type: "Action" })),
    },
    {
      title: "Changes",
      items: dedupeByName(normalized.events.map((event) => ({ name: humanEventLabel(event), type: "Change" }))),
    },
  ];
}

function getDetectedChanges(extraction) {
  const events = extraction?.events || [];
  const relationships = extraction?.relationships || [];
  const changes = events.map((event) => ({
    label: humanEventLabel(event),
    target: event.target || "World Model",
    detail: event.details?.summary || "",
  }));

  for (const relationship of relationships) {
    changes.push({
      label: "Relationship added",
      target: relationship.target || relationship.source || "World Model",
      detail: `${relationship.source} ${humanRelationLabel(relationship.relation)} ${relationship.target}`,
    });
  }

  return changes.length
    ? changes.slice(0, 8)
    : [
        {
          label: "Waiting",
          target: "Tell Atlas what changed",
          detail: "",
        },
      ];
}

function getCurrentTruth(world) {
  const domainState = getDomainWorldState(world);
  const activeWork = domainState.projects[0] || domainState.activeWork[0];
  const openAction = domainState.actions[0];

  if (activeWork) {
    return {
      value: activeWork.name,
      detail: openAction ? `Open action: ${openAction.name}` : "Active",
    };
  }

  return {
    value: "No state",
    detail: "Add a first update",
  };
}

function getDomainWorldState(world) {
  const normalized = normalizeWorld(world);
  const projects = normalized.entities
    .filter((entity) => isPromotedObjectType(entity.type))
    .slice(-6)
    .reverse()
    .map((entity) => ({ name: entity.name, detail: "Current work", status: "Active" }));
  const people = normalized.entities
    .filter((entity) => entity.type === "Person")
    .slice(-6)
    .reverse()
    .map((entity) => ({ name: entity.name, detail: relatedDetail(entity.name, normalized.relationships) }));
  const actions = normalized.events
    .filter((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type))
    .slice(-6)
    .reverse()
    .map((event) => ({ name: event.target || humanEventLabel(event), detail: event.details?.summary || humanEventLabel(event), status: humanEventLabel(event) }));
  const activeWork = normalized.entities
    .filter((entity) => ["System", "Application", "DataSource", "Dataset", "Process"].includes(entity.type))
    .slice(-6)
    .reverse()
    .map((entity) => ({ name: entity.name, detail: entity.type }));
  const decisions = normalized.events
    .filter((event) => event.type === "DecisionMentioned")
    .slice(-6)
    .reverse()
    .map((event) => ({ name: event.target || "Decision", detail: event.details?.summary || formatTimestamp(event.timestamp) }));

  return {
    projects,
    people,
    actions,
    activeWork,
    decisions,
  };
}

function getObjectDirectory(world, filter = "Primary") {
  const normalized = normalizeWorld(world);
  const objectTypes = ["Project", "Goal", "System", "Asset", "Dashboard", "Report", "WorkItem", "Task", "Action", "Event", "AgentRun", "Application", "DataSource", "Dataset", "Process", "Artifact", "Agent"];
  return normalized.entities
    .filter((entity) => objectTypes.includes(entity.type) && !isFirstPersonEntity(entity))
    .filter((entity) => objectVisibilityMatches(entity, filter))
    .slice(-12)
    .reverse()
    .map((entity) => {
      const events = normalized.events.filter((event) => sameName(event.target, entity.name) || String(event.details?.summary || "").toLowerCase().includes(entity.name.toLowerCase()));
      const relationships = normalized.relationships.filter((relationship) => sameName(relationship.source, entity.name) || sameName(relationship.target, entity.name));
      const peopleCount = normalized.entities.filter((related) =>
        related.type === "Person" && !isFirstPersonEntity(related) && (
          relationships.some((relationship) => sameName(relationship.source, related.name) || sameName(relationship.target, related.name)) ||
          events.some((event) => String(event.details?.summary || event.details?.raw_input || "").toLowerCase().includes(related.name.toLowerCase()))
        )
      ).length;
      const attention = events
        .slice()
        .reverse()
        .find((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type));
      const lastEvent = events.at(-1);
      return {
        name: entity.name,
        detail: entity.type,
        visibility: entity.visibility,
        status: classifyObjectStatus(attention ? [attention] : [], events),
        summary: summarizeObject(entity, events.slice().reverse(), relationships),
        peopleCount,
        eventCount: events.length,
        lastUpdated: lastEvent ? formatTimestamp(lastEvent.timestamp) : "",
        attention: attention?.details?.summary || (attention ? humanEventLabel(attention) : ""),
      };
    });
}

function getWorkflowCards(world) {
  const normalized = normalizeWorld(world);
  const registeredAgents = loadRegisteredAgents();
  const byName = new Map();
  const workflowEvents = normalized.events
    .filter((event) => event.details?.workflow?.name || event.details?.workflow_name)
    .sort((left, right) => Date.parse(left.timestamp || "") - Date.parse(right.timestamp || ""));
  for (const event of workflowEvents) {
    const workflow = event.details?.workflow;
    const workflowName = workflow?.name || event.details?.workflow_name;
    if (!workflowName) {
      continue;
    }
    const key = workflowName.toLowerCase();
    const existing = byName.get(key) || emptyWorkflowCard(workflowName);
    const eventTimestamp = Date.parse(event.timestamp || "");
    const existingStageTimestamp = Date.parse(existing.stageUpdatedAt || "");
    const eventIsNewerStage = !Number.isFinite(existingStageTimestamp) || (Number.isFinite(eventTimestamp) && eventTimestamp >= existingStageTimestamp);
    if (workflowOperatorAction(event) === "operator-delete") {
      existing.deleted = true;
      existing.deletedAt = event.timestamp || existing.deletedAt;
      byName.set(key, existing);
      continue;
    }
    existing.deleted = false;
    existing.deletedAt = "";
    existing.objective = workflow?.objective || existing.objective;
    existing.runEndpoint = workflow?.trigger?.endpoint || event.details?.run_endpoint || existing.runEndpoint;
    existing.triggerPayload = workflow?.trigger?.payload || event.details?.trigger_payload || existing.triggerPayload;
    existing.agentId = event.details?.agent_id || existing.agentId;
    const linkedAgent = inferRegisteredAgentForWorkflow(existing, workflowName, registeredAgents, event);
    existing.agentId = existing.agentId || linkedAgent?.agent_id || linkedAgent?.id || "";
    existing.runEndpoint = existing.runEndpoint || linkedAgent?.run_endpoint || linkedAgent?.runEndpoint || "";
    existing.triggerPayload = existing.triggerPayload || linkedAgent?.workflow_setup?.trigger_payload || linkedAgent?.default_payload || "";
    existing.nextStage = workflow?.next_stage || event.details?.workflow_next_stage || existing.nextStage;
    existing.lastUpdate = event.timestamp ? formatTimestamp(event.timestamp) : existing.lastUpdate;
    existing.activity.unshift(event);
    if (workflow?.stage && eventIsNewerStage) {
      existing.currentStage = titleize(canonicalWorkflowState(workflow.stage_status || workflow.stage));
      existing.stageStatus = canonicalWorkflowState(workflow.stage_status || workflow.stage);
      existing.stageUpdatedAt = event.timestamp || existing.stageUpdatedAt;
    }
    if (event.details?.agent_name) {
      existing.agents.add(event.details.agent_name);
    }
    for (const stage of workflow?.stages || []) {
      mergeWorkflowStage(existing.stages, stage);
      if (stage.agent) existing.agents.add(stage.agent);
      if (stage.output) existing.outputs.set(stage.output, {
        ...(existing.outputs.get(stage.output) || {}),
        name: stage.output,
        type: "Output",
        status: "produced",
        artifacts: event.details?.artifacts || [],
        summary: event.details?.summary || "",
      });
      if (stage.input) existing.inputs.add(stage.input);
    }
    for (const output of event.details?.outputs || []) {
      const outputKey = workflowOutputStorageKey(output, event);
      const previousOutput = existing.outputs.get(outputKey) || {};
      existing.outputs.set(outputKey, mergeWorkflowOutput(previousOutput, output, event));
    }
    if (workflow?.stage) {
      mergeWorkflowStage(existing.stages, { name: workflow.stage, status: workflow.stage_status || event.details?.workflow_stage_status, agent: event.details?.agent_name });
    }
    byName.set(key, existing);
  }

  return [...byName.values()].filter((workflow) => !workflow.deleted).map(finalizeWorkflowCard).sort((left, right) => String(right.lastUpdate || "").localeCompare(String(left.lastUpdate || "")));
}

function inferRegisteredAgentForWorkflow(workflow, workflowName, agents, event = {}) {
  if (!Array.isArray(agents) || !agents.length) {
    return null;
  }
  const eventAgentId = event.details?.agent_id;
  const eventAgentName = event.details?.agent_name;
  const runEndpoint = workflow.runEndpoint || event.details?.run_endpoint || "";
  return agents.find((agent) => (
    sameName(agent.agent_id || agent.id, eventAgentId) ||
    sameName(agent.agent_name || agent.name, eventAgentName) ||
    sameName(agent.workflow_setup?.workflow_name, workflowName) ||
    sameName(agent.default_project, workflow.project || workflowName) ||
    Boolean(runEndpoint && sameName(agent.run_endpoint || agent.runEndpoint, runEndpoint))
  )) || null;
}

function workflowOperatorAction(event) {
  return String(event?.details?.command_intent?.source || event?.details?.source || "").trim();
}

function getWorkflowDetail(name, world) {
  return getWorkflowCards(world).find((workflow) => sameName(workflow.name, name)) || finalizeWorkflowCard(emptyWorkflowCard(name || "Workflow"));
}

function parseWorkflowCommandInput(value, workflows = []) {
  const raw = String(value || "").trim();
  const match = raw.match(/^\/workflow\s+([\s\S]+)$/i);
  if (!match) {
    return null;
  }
  const body = match[1].trim();
  const candidates = [...workflows].sort((left, right) => right.name.length - left.name.length);
  const workflow = candidates.find((candidate) => {
    const name = candidate.name.toLowerCase();
    const lowerBody = body.toLowerCase();
    return lowerBody === name || lowerBody.startsWith(`${name},`) || lowerBody.startsWith(`${name}:`) || lowerBody.startsWith(`${name} -`) || lowerBody.startsWith(`${name} `);
  });
  if (!workflow) {
    return null;
  }
  const update = body.slice(workflow.name.length).replace(/^[\s,:-]+/, "").trim();
  return { workflow, update };
}

function inferWorkflowFromUpdateText(value, workflows = []) {
  const text = normalizeMatchText(value);
  if (!text || !workflows.length) {
    return null;
  }
  const scored = workflows
    .map((workflow) => {
      const stageMatches = workflow.stages.filter((stage) => textMentions(text, stage.name)).length;
      const outputMatches = workflow.outputs.filter((output) => textMentions(text, output.name)).length;
      const actionMatches = workflow.humanActions.filter((action) => textMentions(text, action)).length;
      const currentStageMatch = workflow.currentStage && textMentions(text, workflow.currentStage) ? 2 : 0;
      const workflowNameMatch = textMentions(text, workflow.name) ? 4 : 0;
      return {
        workflow,
        score: workflowNameMatch + currentStageMatch + stageMatches + outputMatches + actionMatches,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return scored[0]?.workflow || null;
}

function normalizeMatchText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textMentions(normalizedText, value) {
  const normalizedValue = normalizeMatchText(value);
  if (!normalizedText || !normalizedValue) {
    return false;
  }
  if (normalizedText.includes(normalizedValue) || normalizedValue.includes(normalizedText)) {
    return true;
  }
  const words = normalizedValue.split(" ").filter((word) => word.length > 3);
  return words.length > 0 && words.some((word) => normalizedText.includes(word));
}

function canonicalWorkflowState(value) {
  const normalized = normalizeMatchText(value);
  const map = new Map([
    ["queue", "Queued"],
    ["queued", "Queued"],
    ["pending", "Queued"],
    ["assigned", "Assigned"],
    ["claimed", "Assigned"],
    ["in progress", "In Progress"],
    ["running", "In Progress"],
    ["active", "In Progress"],
    ["working", "In Progress"],
    ["blocked", "Blocked"],
    ["stuck", "Blocked"],
    ["needs review", "Needs Review"],
    ["need review", "Needs Review"],
    ["waiting", "Needs Review"],
    ["waiting on human", "Needs Review"],
    ["human review", "Needs Review"],
    ["review", "Needs Review"],
    ["needs revision", "Revision Requested"],
    ["revision requested", "Revision Requested"],
    ["rejected", "Revision Requested"],
    ["approved", "Approved"],
    ["complete", "Completed"],
    ["completed", "Completed"],
    ["done", "Completed"],
    ["failed", "Failed"],
    ["error", "Failed"],
    ["archived", "Archived"],
    ["archive", "Archived"],
    ["canceled", "Canceled"],
    ["cancelled", "Canceled"],
    ["stopped", "Canceled"],
  ]);
  if (map.has(normalized)) {
    return map.get(normalized);
  }
  for (const [pattern, state] of map.entries()) {
    if (normalized.includes(pattern)) {
      return state;
    }
  }
  return "In Progress";
}

function inferCanonicalWorkflowState(updateText, currentWorkflow = null) {
  const text = normalizeMatchText(updateText);
  if (/\b(next stage|next step|move forward|advance|advance it|advance this)\b/i.test(updateText)) {
    return nextCanonicalWorkflowState(currentWorkflow?.currentStage || currentWorkflow?.status || "Queued");
  }
  if (/\b(blocked|stuck|waiting on dependency|cannot proceed)\b/i.test(updateText)) return "Blocked";
  if (/\b(revision requested|needs revision|rejected|send it back)\b/i.test(updateText)) return "Revision Requested";
  if (/\b(needs review|ready for review|pending review|human review)\b/i.test(updateText)) return "Needs Review";
  if (/\b(approved|accepted|signed off)\b/i.test(updateText)) return "Approved";
  if (/\b(failed|error|crashed)\b/i.test(updateText)) return "Failed";
  if (/\b(archived|archive)\b/i.test(updateText)) return "Archived";
  if (/\b(canceled|cancelled|stopped)\b/i.test(updateText)) return "Canceled";
  if (/\b(complete|completed|done)\b/i.test(updateText)) return "Completed";
  if (/\b(assigned|owner|owns)\b/i.test(updateText)) return "Assigned";
  if (/\b(queued|pending)\b/i.test(updateText)) return "Queued";
  if (/\b(move|start|started|working|running|continue|next)\b/i.test(updateText) || text) return "In Progress";
  return "In Progress";
}

function nextCanonicalWorkflowState(currentState) {
  const current = canonicalWorkflowState(currentState);
  if (sameName(current, "Blocked") || sameName(current, "Revision Requested")) {
    return "In Progress";
  }
  if (sameName(current, "Failed") || sameName(current, "Canceled") || sameName(current, "Completed")) {
    return current;
  }
  const index = CANONICAL_WORKFLOW_SEQUENCE.findIndex((state) => sameName(state, current));
  if (index < 0) {
    return "In Progress";
  }
  return CANONICAL_WORKFLOW_SEQUENCE[Math.min(index + 1, CANONICAL_WORKFLOW_SEQUENCE.length - 1)];
}

function isCanonicalWorkflowState(value) {
  return CANONICAL_WORKFLOW_STATES.some((state) => sameName(state, value));
}

function workflowScopedInput(workflowName, updateText) {
  return [`Workflow: ${workflowName}`, String(updateText || "").trim()].filter(Boolean).join("\n");
}

function deterministicWorkflowCommandIntent(updateText, currentWorkflow = null) {
  const status = inferCanonicalWorkflowState(updateText, currentWorkflow);
  const isAdvance = /\b(next stage|next step|move forward|advance|advance it|advance this)\b/i.test(updateText);
  return {
    intent: isAdvance ? "advance_workflow" : "set_workflow_status",
    workflow_name: currentWorkflow?.name || "",
    transition: isAdvance ? "next" : "",
    status,
    summary: String(updateText || "").trim(),
    confidence: isAdvance || status ? 0.8 : 0.45,
    source: "deterministic",
  };
}

function normalizeWorkflowCommandIntent(payload, fallback) {
  const intent = typeof payload === "object" && payload ? payload : {};
  const transition = String(intent.transition || "").toLowerCase() === "next" ? "next" : "";
  return {
    ...fallback,
    intent: String(intent.intent || fallback.intent || "update_workflow"),
    workflow_name: String(intent.workflow_name || fallback.workflow_name || "").trim(),
    transition,
    status: canonicalWorkflowState(intent.status || fallback.status),
    summary: String(intent.summary || fallback.summary || "").trim(),
    confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : fallback.confidence,
    source: intent.source || "llm",
  };
}

function buildWorkflowCommandPayload({ workflow, intent, updateText, world, stayOnCurrentView = false }) {
  const currentWorkflow = getWorkflowDetail(workflow?.name, world);
  const nextState = intent?.transition === "next"
    ? nextCanonicalWorkflowState(currentWorkflow.currentStage || currentWorkflow.status || workflow?.currentStage || workflow?.status || "Queued")
    : canonicalWorkflowState(intent?.status || updateText);
  const summary = intent?.summary || String(updateText || "").trim() || `Updated ${workflow.name}.`;
  const timestamp = new Date().toISOString();
  const workflowUpdate = {
    name: workflow.name,
    objective: currentWorkflow.objective || "",
    stage: nextState,
    stage_status: nextState,
    next_stage: "",
    stages: [
      {
        name: nextState,
        status: nextState,
        agent: "Human Operator",
      },
    ],
    outputs: Array.isArray(intent?.outputs) && intent.outputs.length ? intent.outputs : inferWorkflowCommandOutputs(updateText),
    summary,
  };

  const extraction = {
    entities: dedupeByEntityKey([
      { type: "Workflow", name: workflow.name, visibility: "primary" },
      ...workflowUpdate.outputs.map((output) => ({ type: "Output", name: output.name, visibility: "secondary" })),
    ]),
    relationships: workflowUpdate.outputs.map((output) => ({ source: output.name, relation: "output_of", target: workflow.name })),
    events: [
      {
        type: "WorkflowUpdated",
        target: workflow.name,
        timestamp,
        details: {
          source: "manual",
          submitted_by: "user",
          summary,
          raw_input: String(updateText || "").trim(),
          command_intent: intent,
          workflow_name: workflow.name,
          workflow: workflowUpdate,
          outputs: workflowUpdate.outputs,
        },
      },
    ],
    extractor: {
      mode: "workflow_command",
      provider: intent?.source === "llm" ? "Atlas Command Router" : "Atlas",
      model: intent?.source === "llm" ? "workflow_intent" : "deterministic_workflow_update",
    },
  };

  return {
    stayOnCurrentView,
    extraction,
    report: {
      source: "manual",
      submitted_by: "user",
      project: currentWorkflow.project || workflow.project || workflow.name,
      message: summary,
      status: nextState,
      workflow: workflowUpdate,
      outputs: workflowUpdate.outputs,
      events: [
        {
          type: "WorkflowUpdated",
          target: workflow.name,
          summary,
        },
      ],
      confidence: intent?.confidence,
      timestamp,
    },
  };
}

function workflowFromAgentExtraction(agent = {}) {
  const agentName = String(agent.agent_name || agent.name || agent.agent_id || agent.id || "Agent").trim();
  const setup = workflowSetupFromAgent(agent);
  const workflowName = String(setup.workflow_name || defaultWorkflowNameForAgent(agent)).trim();
  const objective = String(setup.objective || agent.description || agent.summary || `Run ${agentName} and route outputs for operator review.`).trim();
  const timestamp = new Date().toISOString();
  const reviewRequired = setup.requires_review !== false;
  const outputTypes = commaList(setup.output_types).length ? commaList(setup.output_types) : Array.isArray(agent.output_types) && agent.output_types.length ? agent.output_types : ["markdown"];
  const primaryOutput = String(setup.primary_output || (outputTypes.includes("markdown") ? "model-analysis.md" : `output.${String(outputTypes[0] || "md").replace(/^\./, "")}`)).trim();
  const stages = Array.isArray(setup.stages) && setup.stages.length ? setup.stages : workflowSetupStages(agentName, reviewRequired, primaryOutput);
  const workflow = {
    name: workflowName,
    objective,
    stage: "Queued",
    stage_status: "Queued",
    next_stage: "Assigned",
    trigger: {
      type: "agent_run",
      endpoint: setup.run_endpoint || agent.run_endpoint || agent.runEndpoint || "",
      method: "POST",
      payload: parseMaybeJson(setup.trigger_payload) || setup.trigger_payload || "",
    },
    stages,
    outputs: [],
    summary: `Created workflow from ${agentName}.`,
  };

  return withUpdateSource({
    entities: dedupeByEntityKey([
      { type: "Workflow", name: workflowName, visibility: "primary" },
      { type: "Agent", name: agentName, visibility: "secondary" },
    ]),
    relationships: [
      { source: agentName, relation: "runs", target: workflowName },
    ],
    events: [
      {
        type: "WorkflowUpdated",
        target: workflowName,
        timestamp,
        details: {
          source: "operator-create-workflow-from-agent",
          submitted_by: "user",
          summary: `Created ${workflowName} from ${agentName}.`,
          workflow_name: workflowName,
          agent_name: agentName,
          agent_id: agent.agent_id || agent.id || slugify(agentName),
          run_endpoint: setup.run_endpoint || agent.run_endpoint || agent.runEndpoint || "",
          trigger_payload: setup.trigger_payload || "",
          requires_review: reviewRequired,
          output_types: outputTypes,
          workflow,
        },
      },
    ],
    extractor: {
      mode: "agent_workflow_template",
      provider: "Atlas",
      model: "deterministic_agent_workflow",
    },
  }, {
    source: "manual",
    submitted_by: "user",
  });
}

function workflowSetupFromAgent(agent = {}) {
  const agentName = String(agent.agent_name || agent.name || agent.agent_id || agent.id || "Agent").trim();
  const outputTypes = Array.isArray(agent.output_types) && agent.output_types.length ? agent.output_types.join(", ") : String(agent.output_types || "markdown");
  const contract = agent.workflow_setup && typeof agent.workflow_setup === "object" ? agent.workflow_setup : {};
  const primaryOutput = String(agent.primary_output || agent.primaryOutput || (outputTypes.toLowerCase().includes("markdown") ? "model-analysis.md" : `output.${commaList(outputTypes)[0] || "md"}`));
  const requiresReview = agent.requires_review !== false;
  const triggerPayload = contract.trigger_payload ?? contract.triggerPayload ?? agent.default_payload ?? agent.defaultPayload ?? { project: agent.default_project || "Atlas" };
  return {
    workflow_name: String(contract.workflow_name || contract.workflowName || defaultWorkflowNameForAgent(agent)).trim(),
    objective: String(contract.objective || agent.description || agent.summary || `Run ${agentName} and route outputs for operator review.`).trim(),
    run_endpoint: contract.run_endpoint || contract.runEndpoint || agent.run_endpoint || agent.runEndpoint || "",
    output_types: String(contract.output_types || contract.outputTypes || outputTypes || "markdown"),
    primary_output: primaryOutput,
    trigger_payload: typeof triggerPayload === "string" ? triggerPayload : JSON.stringify(triggerPayload, null, 2),
    requires_review: requiresReview,
    stages: Array.isArray(contract.stages) && contract.stages.length ? contract.stages : workflowSetupStages(agentName, requiresReview, primaryOutput),
  };
}

function workflowSetupStages(agentName, requiresReview, primaryOutput) {
  return [
    { name: "Queued", status: "Queued", agent: agentName, input: "Registered agent trigger", output: "" },
    { name: "Assigned", status: "Assigned", agent: agentName, input: "Atlas run payload", output: "" },
    { name: "In Progress", status: "In Progress", agent: agentName, input: "Agent source inputs", output: "" },
    { name: requiresReview ? "Needs Review" : "Completed", status: requiresReview ? "Needs Review" : "Completed", agent: agentName, input: "", output: primaryOutput },
    ...(requiresReview ? [{ name: "Approved", status: "Approved", agent: "Human Operator", input: primaryOutput, output: "Approved output" }] : []),
  ];
}

function workflowSetupWithReview(form, requiresReview) {
  const agentStage = form.stages.find((stage) => !sameName(stage.agent, "Human Operator")) || form.stages[0] || {};
  return {
    ...form,
    requires_review: requiresReview,
    stages: workflowSetupStages(agentStage.agent || "Agent", requiresReview, form.primary_output || "model-analysis.md"),
  };
}

function parseMaybeJson(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function defaultWorkflowNameForAgent(agent = {}) {
  const defaultProject = String(agent.default_project || agent.defaultProject || "").trim();
  if (defaultProject && !sameName(defaultProject, "Atlas")) {
    return defaultProject;
  }
  const agentName = String(agent.agent_name || agent.name || agent.agent_id || agent.id || "Agent").trim();
  return `${agentName.replace(/\s+agent$/i, "").trim() || agentName} Workflow`;
}

function inferWorkflowCommandOutputs(updateText) {
  const outputName = titleize((String(updateText || "").match(/\b(?:the\s+)?([A-Za-z][A-Za-z\s]+?)\s+is\s+approved\b/i)?.[1] || "").trim());
  return outputName ? [{ name: outputName, type: "Output", status: "approved" }] : [];
}

function augmentWorkflowManualUpdate(extraction, rawInput, world = emptyWorld) {
  const context = workflowContextFromInput(rawInput);
  if (!context) {
    return extraction;
  }
  const currentWorkflow = getWorkflowDetail(context.name, world);
  const workflow = inferWorkflowUpdate(context.name, context.update, currentWorkflow);
  return {
    ...extraction,
    entities: dedupeByEntityKey([
      ...extraction.entities,
      { type: "Workflow", name: context.name, visibility: "primary" },
      ...workflow.outputs.map((output) => ({ type: "Output", name: output.name, visibility: "secondary" })),
    ]),
    relationships: [
      ...extraction.relationships,
      ...workflow.outputs.map((output) => ({ source: output.name, relation: "output_of", target: context.name })),
    ],
    events: [
      ...extraction.events,
      {
        type: "WorkflowUpdated",
        target: context.name,
        timestamp: new Date().toISOString(),
        details: {
          source: "manual",
          submitted_by: "user",
          summary: workflow.summary,
          raw_input: context.update,
          workflow_name: context.name,
          workflow,
          outputs: workflow.outputs,
        },
      },
    ],
  };
}

function workflowContextFromInput(rawInput) {
  const match = String(rawInput || "").trim().match(/^Workflow:\s*([^\n]+)\n([\s\S]*)$/i);
  if (!match) {
    return null;
  }
  const name = match[1].trim();
  const update = match[2].trim();
  return name && update ? { name, update } : null;
}

function inferWorkflowUpdate(workflowName, updateText, currentWorkflow = null) {
  const completedStage = titleize((updateText.match(/\b([A-Za-z][A-Za-z\s]+?)\s+is\s+complete\b/i)?.[1] || "").trim());
  const nextStage = titleize((updateText.match(/\bmove\s+(?:this\s+)?to\s+([A-Za-z][A-Za-z\s]+?)(?:[.!?,]|$)/i)?.[1] || "").trim());
  const outputName = titleize((updateText.match(/\b(?:the\s+)?([A-Za-z][A-Za-z\s]+?)\s+is\s+approved\b/i)?.[1] || "").trim());
  const state = inferCanonicalWorkflowState(updateText, currentWorkflow);
  const stages = [
    { name: state, status: state, agent: /review|approved/i.test(updateText) ? "Human Operator" : "" },
  ].filter(Boolean);
  const outputs = outputName ? [{ name: outputName, type: "Output", status: "approved" }] : [];
  return {
    name: workflowName,
    objective: "",
    stage: state,
    stage_status: state,
    next_stage: "",
    stages,
    outputs,
    summary: [updateText, nextStage ? `Requested next work context: ${nextStage}.` : "", completedStage && !isCanonicalWorkflowState(completedStage) ? `Completed context: ${completedStage}.` : ""].filter(Boolean).join(" "),
  };
}

function emptyWorkflowCard(name) {
  return {
    name,
    type: "Workflow",
    objective: "",
    status: "Active",
    currentStage: "",
    nextStage: "",
    stages: [],
    agents: new Set(),
    outputs: new Map(),
    inputs: new Set(),
    agentId: "",
    runEndpoint: "",
    triggerPayload: "",
    humanActions: [],
    activity: [],
    lastUpdate: "",
    stageStatus: "",
    stageUpdatedAt: "",
  };
}

function mergeWorkflowOutput(previousOutput = {}, output = {}, event = {}) {
  const previousTimestamp = Date.parse(previousOutput.updatedAt || previousOutput.updated_at || "");
  const nextTimestamp = Date.parse(event.timestamp || "");
  const previousIsNewer = Number.isFinite(previousTimestamp) && Number.isFinite(nextTimestamp) && previousTimestamp > nextTimestamp;
  const base = previousIsNewer ? previousOutput : { ...previousOutput, ...output };
  const incomingDocuments = Object.prototype.hasOwnProperty.call(output, "documents") ? dedupeDocumentFiles(output.documents || []) : previousOutput.documents || [];
  return {
    ...base,
    name: base.name || output.name,
    artifacts: [...new Set([...(previousOutput.artifacts || []), ...(output.artifacts || []), ...(event.details?.artifacts || [])])],
    documents: previousIsNewer ? previousOutput.documents || [] : incomingDocuments,
    summary: previousIsNewer ? previousOutput.summary || "" : output.summary || event.details?.summary || previousOutput.summary || "",
    createdAt: previousOutput.createdAt || output.created_at || output.createdAt || event.timestamp || "",
    updatedAt: previousIsNewer ? previousOutput.updatedAt || previousOutput.updated_at || "" : event.timestamp || previousOutput.updatedAt || "",
  };
}

function workflowOutputStorageKey(output = {}, event = {}) {
  const name = String(output.name || "Output").trim() || "Output";
  if (isApprovedOutput(output)) {
    return `${name}::approved::${event.timestamp || output.created_at || output.createdAt || output.updated_at || output.updatedAt || ""}`;
  }
  return name;
}

function mergeWorkflowStage(stages, stage) {
  const originalName = String(stage?.name || "").trim();
  const state = canonicalWorkflowState(stage?.status || stage?.state || stage?.name || "reported");
  const name = state;
  if (!name) {
    return;
  }
  const existing = stages.find((item) => sameName(item.name, name));
  const next = {
    name,
    status: normalizeWorkflowStatus(state),
    agent: String(stage.agent || "").trim(),
    input: String(stage.input || "").trim(),
    output: String(stage.output || "").trim(),
    detail: isCanonicalWorkflowState(originalName) ? "" : originalName,
  };
  if (existing) {
    Object.assign(existing, {
      ...existing,
      ...Object.fromEntries(Object.entries(next).filter(([, value]) => value)),
    });
    stages.splice(stages.indexOf(existing), 1);
    stages.push(existing);
  } else {
    stages.push(next);
  }
}

function finalizeWorkflowCard(workflow) {
  const agents = [...workflow.agents].filter(Boolean).filter((agent) => !/human/i.test(agent));
  const outputs = [...workflow.outputs.values()].filter((output) => !isDeprecatedOpportunityShortlistName(output.name));
  const currentStage = titleize(workflow.currentStage || workflow.stages.at(-1)?.name || "In Progress");
  const latestStage = workflow.stages.find((stage) => sameName(stage.name, currentStage)) || workflow.stages.at(-1);
  const status = canonicalWorkflowState(workflow.stageStatus || latestStage?.status || currentStage);
  const terminal = isTerminalWorkflowState(status);
  const reviewStage = isWorkflowReviewStage(status);
  const outputsReady = terminal || !reviewStage ? [] : outputs.filter((output) => {
    const outputStatus = String(output.status || "");
    return outputStatus.includes("review") || outputStatus.includes("ready") || outputStatus.includes("revision") || outputStatus.includes("rejected");
  });
  const humanActions = terminal || !reviewStage ? [] : workflowHumanActions(latestStage, outputsReady);

  return {
    ...workflow,
    status,
    currentStage,
    agents,
    agentCount: agents.length,
    outputs,
    outputsReady,
    outputsReadyCount: outputsReady.length,
    outputLabel: outputsReady[0] ? `${outputsReady[0].name} ready` : outputs[0]?.name || "",
    nextAction: humanActions[0] || (workflow.nextStage ? `Move to ${workflow.nextStage}` : ""),
    humanActions,
    activity: workflow.activity.slice(0, 8),
    lastUpdatedRelative: relativeTimestamp(workflow.activity[0]?.timestamp),
  };
}

function workflowHumanActions(waitingStage, outputsReady) {
  const actions = [];
  if (waitingStage?.status === "revision_requested") {
    actions.push(`Resolve requested revision for ${waitingStage.output || outputsReady[0]?.name || "workflow output"}`);
  }
  if (waitingStage && /human/i.test(`${waitingStage.name} ${waitingStage.agent}`)) {
    actions.push(`Review ${waitingStage.input || outputsReady[0]?.name || "workflow output"}`);
  }
  for (const output of outputsReady) {
    actions.push(`Review ${output.name}`);
  }
  return [...new Set(actions)].slice(0, 4);
}

function isTerminalWorkflowState(value) {
  return ["approved", "completed", "canceled", "cancelled", "archived"].includes(normalizeWorkflowStatus(value));
}

function isWorkflowReviewStage(value) {
  return ["needs_review", "revision_requested"].includes(normalizeWorkflowStatus(value));
}

function latestWorkflowRevisionRequest(workflow) {
  const event = workflow.activity.find((item) => {
    const text = normalizeMatchText(`${item.details?.summary || ""} ${item.details?.raw_input || ""} ${item.summary || ""} ${item.details?.status || ""}`);
    return text.includes("revision") || text.includes("denied") || text.includes("rejected");
  });
  return event?.details?.summary || event?.details?.raw_input || event?.summary || "Operator requested revision of the previous workflow output.";
}

function workflowProgress(workflow) {
  const stages = workflowStages(workflow);
  const isSuccessfulTerminal = ["approved", "completed"].includes(normalizeWorkflowStatus(workflow.status || workflow.currentStage));
  const total = Math.max(1, stages.length);
  const completed = isSuccessfulTerminal ? total : stages.filter((stage) => stage.status === "completed").length;
  const currentWeight = isSuccessfulTerminal ? 0 : stages.some((stage) => ["in_progress", "running", "waiting", "review", "needs_review"].includes(stage.status)) ? 0.5 : 0;
  return {
    total,
    completed,
    percent: Math.min(100, Math.round(((completed + currentWeight) / total) * 100)),
  };
}

function workflowStages(workflow) {
  const states = workflowStageSequence(workflow);
  const currentIndex = Math.max(0, states.findIndex((state) => sameName(state, workflow.currentStage) || sameName(state, workflow.status)));
  return states.map((state, index) => {
    const reported = workflow.stages.find((stage) => sameName(stage.name, state));
    const terminalApproved = sameName(workflow.status, "Approved") || sameName(workflow.currentStage, "Approved");
    const terminalCompleted = sameName(workflow.status, "Completed") || sameName(workflow.currentStage, "Completed");
    return {
      ...reported,
      name: state,
      status: terminalApproved || terminalCompleted || index < currentIndex ? "completed" : index === currentIndex ? normalizeWorkflowStatus(state) : "queued",
      detail: reported?.detail || reported?.input || reported?.output || "",
      agent: reported?.agent || "",
      input: reported?.input || "",
      output: reported?.output || "",
    };
  });
}

function workflowStageSequence(workflow) {
  const status = normalizeWorkflowStatus(workflow.status || workflow.currentStage);
  if (["blocked", "failed", "canceled", "revision_requested"].includes(status)) {
    const exceptional = titleize(status);
    return [...CANONICAL_WORKFLOW_SEQUENCE.filter((state) => !sameName(state, "Completed")), exceptional];
  }
  return CANONICAL_WORKFLOW_SEQUENCE;
}

function workflowDisplayStageStatus(stage, workflow) {
  const status = normalizeWorkflowStatus(stage.status);
  if (status === "in_progress") return "running";
  if (status === "waiting" && /human|review/i.test(`${stage.name} ${stage.agent}`)) return "review";
  if (sameName(stage.name, workflow.currentStage) && status !== "completed") return status || "running";
  return status || "queued";
}

function workflowStepMeta(status) {
  const normalized = normalizeWorkflowStatus(status);
  const meta = {
    completed: { label: "done", icon: "check", ring: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    running: { label: "running", icon: "loader", ring: "border-blue-200 bg-blue-50 text-blue-700" },
    queued: { label: "queued", icon: "circle", ring: "border-zinc-200 bg-zinc-100 text-zinc-500" },
    failed: { label: "failed", icon: "alert", ring: "border-red-200 bg-red-50 text-red-700" },
    blocked: { label: "blocked", icon: "alert", ring: "border-red-200 bg-red-50 text-red-700" },
    review: { label: "review", icon: "hand", ring: "border-amber-200 bg-amber-50 text-amber-700" },
    waiting: { label: "waiting", icon: "circle", ring: "border-amber-200 bg-amber-50 text-amber-700" },
  };
  return meta[normalized] || meta.queued;
}

function workflowTone(status) {
  const value = normalizeWorkflowStatus(status);
  if (["completed", "complete", "success", "done", "ready_for_review"].includes(value)) {
    return { badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  }
  if (["running", "in_progress", "active"].includes(value)) {
    return { badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" };
  }
  if (["failed", "blocked", "error", "danger"].includes(value)) {
    return { badge: "bg-red-50 text-red-700", dot: "bg-red-500" };
  }
  if (["revision_requested", "rejected", "needs_revision"].includes(value)) {
    return { badge: "bg-orange-50 text-orange-700", dot: "bg-orange-500" };
  }
  if (["review", "waiting", "needs_review"].includes(value) || String(status || "").toLowerCase().includes("waiting")) {
    return { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  }
  return { badge: "bg-zinc-100 text-zinc-600", dot: "bg-zinc-500" };
}

function workflowConfidence(workflow) {
  const confidences = workflow.activity.map((event) => Number(event.details?.confidence)).filter((value) => Number.isFinite(value));
  if (!confidences.length) {
    return 90;
  }
  return Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100);
}

function workflowActivityKind(event) {
  const label = `${event.type} ${event.details?.status || ""}`.toLowerCase();
  if (/failed|blocked|error/.test(label)) return { icon: "alert", color: "text-red-600" };
  if (/revision|rejected/.test(label)) return { icon: "alert", color: "text-orange-600" };
  if (/review|waiting|needed/.test(label)) return { icon: "alert", color: "text-amber-600" };
  if (/handoff|stage|workflow/.test(label)) return { icon: "handoff", color: "text-zinc-700" };
  if (/completed|changed|report/.test(label)) return { icon: "check", color: "text-emerald-600" };
  return { icon: "info", color: "text-blue-600" };
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workflow";
}

function normalizeWorkflowStatus(value) {
  return String(value || "reported").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getObjectHierarchyGroups(world) {
  const normalized = normalizeWorld(world);
  const cards = normalized.entities
    .filter((entity) => !isFirstPersonEntity(entity))
    .map((entity) => buildObjectCard(entity, normalized));

  return {
    projects: cards.filter((object) => ["Project", "Goal", "Workflow"].includes(object.type) && object.visibility === "primary"),
    systemsAndAssets: cards.filter((object) => ["System", "Asset", "Dashboard", "Application", "DataSource", "Dataset", "Process"].includes(object.type) && object.visibility === "primary"),
    workItems: cards.filter((object) => ["WorkItem", "Task", "Action", "Report", "Event"].includes(object.type)),
    people: cards.filter((object) => object.type === "Person"),
    agents: cards.filter((object) => object.type === "Agent"),
    artifacts: cards.filter((object) => object.type === "Artifact" || object.visibility === "debug"),
  };
}

function buildObjectCard(entity, world) {
  const events = relatedEventsForEntity(entity, world.events);
  const relationships = world.relationships.filter((relationship) => sameName(relationship.source, entity.name) || sameName(relationship.target, entity.name));
  const relatedEntities = relatedEntitiesForObject(entity, relationships, events, world.entities);
  const workItemNames = relatedWorkItemNames(entity, world);
  const agentNames = relatedAgentNames(entity, world);
  const outputNames = relatedOutputNames(entity, world);
  const children = {
    people: relatedEntities.filter((item) => item.type === "Person").map(childObject),
    systems: relatedEntities.filter((item) => ["System", "Asset", "Dashboard", "Application", "DataSource", "Dataset"].includes(item.type)).map(childObject),
    agents: agentNames.map((name) => ({ name, type: "Agent" })),
    workItems: workItemNames.map((name) => ({ name, type: "WorkItem" })),
    actions: events
      .filter((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type))
      .slice(-5)
      .reverse()
      .map((event) => ({ name: actionTitle(event), clickable: false })),
    changes: events.slice(-5).reverse().map((event) => ({ name: humanEventLabel(event), clickable: false })),
  };
  const attention = events
    .slice()
    .reverse()
    .find((event) => ["ChangeNeeded", "MeetingNeeded", "DependencyIdentified", "BlockerIdentified", "RequestMade"].includes(event.type));
  const lastEvent = events.at(-1);

  return {
    name: entity.name,
    type: entity.type,
    detail: entity.type,
    visibility: entity.visibility,
    status: classifyObjectStatus(attention ? [attention] : [], events),
    summary: summarizeObject(entity, events.slice().reverse(), relationships),
    peopleCount: children.people.length,
    agentCount: agentNames.length,
    openActionCount: children.actions.length,
    outputsProducedCount: outputNames.length,
    recentChangeCount: events.length,
    eventCount: events.length,
    lastUpdated: lastEvent ? formatTimestamp(lastEvent.timestamp) : "",
    children,
  };
}

function relatedEventsForEntity(entity, events) {
  return events.filter((event) =>
    sameName(event.target, entity.name) ||
    sameName(event.details?.project, entity.name) ||
    sameName(event.details?.action_target, entity.name) ||
    String(event.details?.summary || event.details?.raw_input || "").toLowerCase().includes(entity.name.toLowerCase())
  );
}

function relatedEntitiesForObject(entity, relationships, events, entities) {
  const relatedNames = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]).filter((name) => !sameName(name, entity.name)));
  return dedupeByName(
    entities
      .filter((candidate) => !isFirstPersonEntity(candidate) && candidate.visibility !== "debug" && !sameName(candidate.name, entity.name))
      .filter((candidate) =>
        relatedNames.has(candidate.name) ||
        events.some((event) => String(event.details?.summary || event.details?.raw_input || "").toLowerCase().includes(candidate.name.toLowerCase()))
      )
  );
}

function childObject(entity) {
  return {
    name: entity.name,
    type: entity.type,
  };
}

function isPromotedObjectType(type) {
  return ["Workflow", "Project", "Goal", "System", "Asset", "Dashboard", "Application", "DataSource", "Dataset", "Process"].includes(type);
}

function dedupeNames(names) {
  const seen = new Set();
  return names.filter((name) => {
    const key = String(name || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function relatedWorkItemNames(entity, world) {
  const relationshipNames = world.relationships
    .filter((relationship) => sameName(relationship.target, entity.name) && ["belongs_to", "related_to", "run_for"].includes(relationship.relation))
    .map((relationship) => relationship.source);
  const eventNames = world.events
    .filter((event) => sameName(event.target, entity.name) || sameName(event.details?.project, entity.name))
    .flatMap((event) => [event.details?.action_target, ...(event.details?.work_items || [])])
    .filter(Boolean);
  const workTypes = new Set(["WorkItem", "Task", "Action", "Report", "Event"]);
  return dedupeNames([...relationshipNames, ...eventNames])
    .filter((name) => world.entities.some((entityCandidate) => sameName(entityCandidate.name, name) && workTypes.has(entityCandidate.type)))
    .slice(0, 8);
}

function relatedAgentNames(entity, world) {
  const fromEvents = world.events
    .filter((event) => sameName(event.target, entity.name) || sameName(event.details?.project, entity.name) || sameName(event.details?.action_target, entity.name))
    .map((event) => event.details?.agent_name)
    .filter(Boolean);
  const fromRelationships = world.relationships
    .filter((relationship) => sameName(relationship.target, entity.name) || sameName(relationship.source, entity.name))
    .flatMap((relationship) => [relationship.source, relationship.target]);
  return dedupeNames([...fromEvents, ...fromRelationships])
    .filter((name) => world.entities.some((entityCandidate) => sameName(entityCandidate.name, name) && entityCandidate.type === "Agent"))
    .slice(0, 8);
}

function relatedOutputNames(entity, world) {
  const fromEvents = world.events
    .filter((event) => sameName(event.target, entity.name) || sameName(event.details?.project, entity.name))
    .flatMap((event) => event.details?.artifacts || []);
  const fromRelationships = world.relationships
    .filter((relationship) => sameName(relationship.target, entity.name) && ["belongs_to", "changed_artifact"].includes(relationship.relation))
    .map((relationship) => relationship.source);
  return dedupeNames([...fromEvents, ...fromRelationships]).slice(0, 12);
}

function groupRelationshipsForObject(object, relationships, entities) {
  const groups = new Map();
  for (const relationship of relationships) {
    const otherName = sameName(relationship.source, object.name) ? relationship.target : relationship.source;
    if (!otherName || sameName(otherName, object.name)) {
      continue;
    }
    const entity = entities.find((item) => sameName(item.name, otherName)) || { name: otherName, type: "Object" };
    if (isFirstPersonEntity(entity) || entity.visibility === "debug") {
      continue;
    }
    const label = titleize(humanRelationLabel(relationship.relation));
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(entity);
  }

  return [...groups.entries()]
    .map(([label, objects]) => ({ label, objects: dedupeByName(objects).slice(0, 8) }))
    .filter((group) => group.objects.length);
}

function objectVisibilityMatches(entity, filter) {
  if (filter === "All") {
    return true;
  }
  if (filter === "Agents") {
    return entity.type === "Agent";
  }
  if (filter === "Artifacts") {
    return entity.type === "Artifact";
  }
  if (filter === "Debug") {
    return entity.visibility === "debug";
  }
  return entity.visibility === "primary" && isPromotedObjectType(entity.type);
}

function classifyObjectStatus(openEvents, events) {
  const text = [...openEvents, ...events].map((event) => `${event.type || ""} ${event.details?.summary || ""} ${event.details?.raw_input || ""}`).join(" ").toLowerCase();
  if (text.includes("complete") || text.includes("completed") || text.includes("done")) return "Complete";
  if (text.includes("block") || text.includes("blocked") || text.includes("waiting on")) return "Blocked";
  if (openEvents.length) return "Needs Attention";
  if (!events.length) return "Waiting";
  return "Active";
}

function getEventChips(event) {
  const source = `${event.target || ""} ${event.details?.summary || ""} ${event.details?.raw_input || ""}`;
  const matches = source.match(/\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3}\b/g) || [];
  return [...new Set(matches.filter((item) => item.length > 2 && !["World Model", "I", "Me", "My"].includes(item)))].slice(0, 4);
}

function isFirstPersonEntity(entity) {
  const name = String(entity?.name || "").trim().toLowerCase();
  return entity?.type === "Person" && ["i", "me", "my", "myself"].includes(name);
}

function dedupeByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.name || "").toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeByEntityKey(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = entityKey(item);
    if (!item?.name || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function relatedDetail(name, relationships) {
  const relationship = relationships.find((item) => sameName(item.source, name) || sameName(item.target, name));
  if (!relationship) {
    return "";
  }

  const other = sameName(relationship.source, name) ? relationship.target : relationship.source;
  return `${humanRelationLabel(relationship.relation)} ${other}`;
}

function humanEventLabel(event) {
  const text = `${event?.type || ""} ${event?.target || ""} ${event?.details?.summary || ""} ${event?.details?.raw_input || ""}`.toLowerCase();

  if (event?.details?.source === "agent" || event?.type === "AgentReport") return "Agent report";
  if (text.includes("outdated") && text.includes("map")) return "Mapping outdated";
  if (text.includes("delay") || text.includes("delayed")) return "Project delayed";
  if (text.includes("decision")) return "Decision made";
  if (text.includes("feedback")) return "Feedback received";
  if (text.includes("block") || text.includes("waiting on") || text.includes("pending")) return "Blocker identified";

  const labels = {
    MeetingHeld: "Meeting held",
    FeedbackReceived: "Feedback received",
    RequestMade: "Request made",
    ChangeNeeded: "Requirement changed",
    MeetingNeeded: "Meeting needed",
    DependencyIdentified: "Dependency identified",
    BlockerIdentified: "Blocker identified",
    StatusChanged: "Status changed",
    DecisionMentioned: "Decision made",
    InformationLearned: "Update captured",
    AgentReport: "Agent report",
    TaskCompleted: "Task completed",
    ArtifactChanged: "Artifact changed",
    UpdateCaptured: "Update captured",
    MappingOutdated: "Mapping outdated",
    RequirementChanged: "Requirement changed",
    TaskCreated: "Task created",
    EntityCreated: "Object added",
    RelationshipCreated: "Relationship added",
  };

  return labels[event?.type] || titleize(event?.type || "Update Captured");
}

function agentActivityTitle(event) {
  const agent = event.details?.agent_name || "Agent";
  const project = event.details?.project || event.target || "Atlas";
  const status = String(event.details?.status || "").toLowerCase();
  if (event.type === "TaskCompleted" || status === "completed") {
    return `${agent} completed work on ${project}`;
  }
  return `${agent} reported on ${project}`;
}

function humanRelationLabel(value) {
  const labels = {
    owns: "owns",
    uses: "uses",
    depends_on: "depends on",
    blocks: "blocks",
    requested: "requested",
    provided_feedback_on: "gave feedback on",
    needs_change_to: "needs change to",
    replaces: "replaces",
    belongs_to: "belongs to",
    responsible_for: "is responsible for",
    worked_on: "worked on",
    reported_on: "reported on",
    changed: "changed",
    changed_artifact: "changed artifact",
    performed: "performed",
    supports: "supports",
    run_for: "run for",
    related_to: "is related to",
  };

  return labels[value] || String(value || "is related to").replaceAll("_", " ");
}

function titleize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function answerQuery(rawQuery, world) {
  const queryText = rawQuery.toLowerCase();
  const normalized = normalizeWorld(world);

  if (isTodayEventsQuery(queryText)) {
    const events = eventsForToday(normalized.events);
    return events.length ? events.map(formatEventAnswer).join("\n") : "No events recorded today.";
  }

  if (queryText.includes("what happened") || queryText.includes("recent") || queryText.includes("latest")) {
    const events = normalized.events.slice(-8).reverse();
    return events.length ? events.map(formatEventAnswer).join("\n") : "No events recorded yet.";
  }

  if (queryText.includes("active entities") || queryText.includes("show entities")) {
    return normalized.entities.length
      ? normalized.entities.map((entity) => `${entity.type || "Unknown"}: ${entity.name}`).join("\n")
      : "No entities recorded.";
  }

  const affectedTarget = extractQuotedOrNamedTarget(rawQuery, normalized);
  if (queryText.includes("events affected") || queryText.includes("events affect")) {
    const events = normalized.events.filter((event) => sameName(event.target, affectedTarget));
    return events.length ? events.map(formatEventAnswer).join("\n") : `No events found for ${affectedTarget || "that target"}.`;
  }

  if (queryText.includes("related")) {
    const relationships = normalized.relationships.filter(
      (relationship) => sameName(relationship.source, affectedTarget) || sameName(relationship.target, affectedTarget),
    );
    return relationships.length
      ? relationships.map((relationship) => `${relationship.source} ${relationship.relation} ${relationship.target}`).join("\n")
      : `No relationships found for ${affectedTarget || "that entity"}.`;
  }

  return [
    `${normalized.entities.length} entities`,
    `${normalized.relationships.length} relationships`,
    `${normalized.events.length} events`,
  ].join("\n");
}

function isTodayEventsQuery(queryText) {
  return queryText.includes("today") && (
    queryText.includes("what happened") ||
    queryText.includes("what changed") ||
    queryText.includes("changed") ||
    queryText.includes("happened") ||
    queryText.includes("events")
  );
}

function eventsForToday(events) {
  const today = new Date().toISOString().slice(0, 10);
  return events.filter((event) => String(event.timestamp || "").slice(0, 10) === today);
}

function extractQuotedOrNamedTarget(rawQuery, world) {
  const quoted = rawQuery.match(/"([^"]+)"/)?.[1];
  if (quoted) {
    return quoted;
  }

  const lowerQuery = rawQuery.toLowerCase();
  return world.entities.find((entity) => lowerQuery.includes(String(entity.name || "").toLowerCase()))?.name || "";
}

function formatEventAnswer(event) {
  const target = event.target ? `: ${event.target}` : "";
  const summary = event.details?.summary ? ` - ${event.details.summary}` : "";
  return `${humanEventLabel(event)}${target} (${formatTimestamp(event.timestamp)})${summary}`;
}

function normalizeWorld(value) {
  return {
    entities: dedupeByEntityKey(Array.isArray(value?.entities) ? value.entities.filter((entity) => entity?.name).map(normalizeEntity) : []),
    relationships: Array.isArray(value?.relationships)
      ? value.relationships.filter((relationship) => relationship?.source && relationship?.target)
      : [],
    events: Array.isArray(value?.events) ? value.events : [],
  };
}

function normalizeExtraction(value, rawInput = "") {
  const world = normalizeWorld(value);
  return {
    entities: world.entities.map((entity) => ({
      id: entity.id,
      type: canonicalEntityType(entity.type),
      name: String(entity.name || "").trim(),
      visibility: canonicalVisibility(entity.visibility, entity),
    })),
    relationships: world.relationships.map((relationship) => ({
      source: String(relationship.source || "").trim(),
      relation: canonicalRelation(relationship.relation),
      target: String(relationship.target || "").trim(),
    })),
    events: world.events.map((event) => ({
      type: canonicalEventType(event.type),
      target: String(event.target || "").trim(),
      timestamp: event.timestamp || new Date().toISOString(),
      details: normalizeEventDetails(event.details, rawInput),
    })),
  };
}

function applyObjectHierarchy(extraction) {
  const normalized = normalizeExtraction(extraction);
  const primary = selectPrimaryEntity(normalized.entities, normalized.events);
  if (!primary) {
    return normalized;
  }

  const entities = normalized.entities.map((entity) => ({
    ...entity,
    visibility: visibilityForContextualEntity(entity, primary),
  }));
  const relationships = [...normalized.relationships];

  for (const entity of entities) {
    if (sameName(entity.name, primary.name) || isFirstPersonEntity(entity) || entity.type === "Agent") {
      continue;
    }
    if (normalized.events.some((event) => eventMentionsEntityAndPrimary(event, entity, primary)) || !hasRelationshipToPrimary(entity, primary, relationships)) {
      const relation = entity.visibility === "debug" ? "supports" : "related_to";
      const candidate = { source: entity.name, relation, target: primary.name };
      if (!relationships.some((relationship) => relationshipKey(relationship) === relationshipKey(candidate))) {
        relationships.push(candidate);
      }
    }
  }

  return {
    ...normalized,
    entities,
    relationships,
  };
}

function selectPrimaryEntity(entities, events) {
  const candidates = entities.filter((entity) => !isFirstPersonEntity(entity) && entity.type !== "Agent" && entity.visibility !== "debug");
  return (
    candidates.find((entity) => isPromotedObjectType(entity.type)) ||
    candidates.find((entity) => events.some((event) => sameName(event.target, entity.name))) ||
    candidates[0]
  );
}

function visibilityForContextualEntity(entity, primary) {
  if (sameName(entity.name, primary.name)) {
    return "primary";
  }
  if (entity.type === "Agent") {
    return "secondary";
  }
  if (entity.type === "AgentRun") {
    return "secondary";
  }
  if (["Stage", "Output", "WorkItem", "Task", "Action", "Report", "Event"].includes(entity.type)) {
    return "secondary";
  }
  if (entity.type === "Artifact" || isImplementationArtifactName(entity.name) || isLowLevelReferenceName(entity.name)) {
    return "debug";
  }
  if (isPromotedObjectType(entity.type)) {
    return "primary";
  }
  if (["Person", "Team", "Organization"].includes(entity.type)) {
    return "secondary";
  }
  return entity.visibility || "secondary";
}

function eventMentionsEntityAndPrimary(event, entity, primary) {
  const text = `${event.target || ""} ${event.details?.summary || ""} ${event.details?.raw_input || ""}`.toLowerCase();
  return text.includes(primary.name.toLowerCase()) && text.includes(entity.name.toLowerCase());
}

function hasRelationshipToPrimary(entity, primary, relationships) {
  return relationships.some((relationship) =>
    (sameName(relationship.source, entity.name) && sameName(relationship.target, primary.name)) ||
    (sameName(relationship.target, entity.name) && sameName(relationship.source, primary.name))
  );
}

function canonicalEntityType(value) {
  const normalized = normalizeTypeName(value);
  return ENTITY_TYPES.includes(normalized) ? normalized : "Unknown";
}

function normalizeEntity(entity) {
  const normalized = {
    type: canonicalEntityType(entity.type),
    name: String(entity.name || "").trim(),
  };
  return {
    ...normalized,
    id: entity.id || canonicalId(normalized.type, normalized.name),
    canonical_key: entity.canonical_key || canonicalKey(normalized.type, normalized.name),
    visibility: canonicalVisibility(entity.visibility, normalized),
  };
}

function canonicalVisibility(value, entity) {
  const explicit = String(value || "").toLowerCase();
  if (["primary", "secondary", "debug"].includes(explicit)) {
    return explicit;
  }
  if (entity.type === "Agent" || entity.type === "AgentRun" || ["Stage", "Output", "WorkItem", "Task", "Action", "Report", "Event"].includes(entity.type)) {
    return "secondary";
  }
  if (entity.type === "Artifact" || isImplementationArtifactName(entity.name) || isLowLevelReferenceName(entity.name)) {
    return "debug";
  }
  if (isPromotedObjectType(entity.type)) {
    return "primary";
  }
  return "primary";
}

function isImplementationArtifactName(name) {
  const value = String(name || "").trim();
  if (!value) {
    return false;
  }
  if (value.includes("/") || value.includes("\\")) {
    return true;
  }
  if (/^(dist|build|node_modules|coverage)$/i.test(value)) {
    return true;
  }
  return /\.[a-z0-9]{1,8}$/i.test(value);
}

function isLowLevelReferenceName(name) {
  const value = String(name || "").toLowerCase();
  return /\b(sys ids?|ids?|keys?|tokens?|config|mapping|map)\b/.test(value);
}

function canonicalEventType(value) {
  const normalized = normalizeTypeName(value);
  return EVENT_TYPES.includes(normalized) ? normalized : "InformationLearned";
}

function normalizeTypeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, char) => char.toUpperCase())
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeEventDetails(details, rawInput) {
  const normalized = typeof details === "object" && details ? { ...details } : {};
  if (!normalized.summary) {
    normalized.summary = rawInput;
  }
  if (!normalized.raw_input) {
    normalized.raw_input = rawInput;
  }
  return normalized;
}

function canonicalRelation(value) {
  const relation = String(value || "related_to")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!relation) {
    return "related_to";
  }

  const aliases = [
    [/^(requested|requests|asked_for|asks_for|wants|wanted|needs|requested_from)$/, "requested"],
    [/^(gave_feedback_on|provided_feedback_on|provided_feedback_for|gave_feedback_for|feedback_on|feedback_about|reviewed|commented_on)$/, "provided_feedback_on"],
    [/^(needs_change_to|needs_changes_to|requires_change_to|requires_changes_to|change_needed_for|change_required_for|update_needed_for|needs_update_to)$/, "needs_change_to"],
    [/^(uses|used|uses_system|uses_application|uses_source|connects_to|links_to|linked_to)$/, "uses"],
    [/^(replaces|replaced|supersedes|replaces_old|new_version_of)$/, "replaces"],
    [/^(belongs_to|part_of|member_of|under|within)$/, "belongs_to"],
    [/^(responsible_for|owner_of|accountable_for|assigned_to)$/, "responsible_for"],
    [/^(waiting_on|blocked_by|depends_on_response_from|pending_from|awaiting)$/, "waiting_on"],
    [/^(blocks|blocking|blocked)$/, "blocks"],
    [/^(owns|owned_by)$/, "owns"],
    [/^(depends_on|requires|blocked_by_dependency|needs_dependency)$/, "depends_on"],
    [/^(worked_on|reported_on|reported|reported_to)$/, "reported_on"],
    [/^(changed_artifact|changed_file|changed_files|modified_artifact|modified_file)$/, "changed_artifact"],
    [/^(supports|supporting|context_for|applies_to)$/, "supports"],
    [/^(run_for|ran_for|execution_for)$/, "run_for"],
  ];

  for (const [pattern, canonical] of aliases) {
    if (pattern.test(relation)) {
      return canonical;
    }
  }

  const allowed = new Set(["owns", "uses", "depends_on", "blocks", "requested", "provided_feedback_on", "needs_change_to", "replaces", "belongs_to", "responsible_for", "related_to", "worked_on", "reported_on", "changed", "changed_artifact", "performed", "supports", "run_for"]);
  return allowed.has(relation) ? relation : "related_to";
}

function withUpdateSource(extraction, metadata) {
  const normalized = normalizeExtraction(extraction);
  return {
    ...normalized,
    source: metadata.source,
    submitted_by: metadata.submitted_by,
    report_id: metadata.report_id,
    entities: normalized.entities,
    relationships: normalized.relationships,
    events: normalized.events.map((event) => ({
      ...event,
      details: {
        ...event.details,
        source: metadata.source,
        submitted_by: metadata.submitted_by,
        report_id: metadata.report_id,
      },
    })),
    extractor: extraction.extractor,
  };
}

function loadWorld() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}";
    const world = normalizeWorld(JSON.parse(stored));
    if (!localStorage.getItem(STORAGE_KEY) && stored !== "{}") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
    }
    return world;
  } catch {
    return emptyWorld;
  }
}

function saveWorld(world) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWorld(world)));
}

function loadAgentReports() {
  try {
    const reports = JSON.parse(localStorage.getItem(AGENT_REPORTS_KEY) || "[]");
    return Array.isArray(reports) ? reports : [];
  } catch {
    return [];
  }
}

function saveAgentReports(reports) {
  localStorage.setItem(AGENT_REPORTS_KEY, JSON.stringify(dedupeReports(reports)));
}

function loadRegisteredAgents() {
  try {
    const agents = JSON.parse(localStorage.getItem(REGISTERED_AGENTS_KEY) || "[]");
    return Array.isArray(agents) ? agents : [];
  } catch {
    return [];
  }
}

function saveRegisteredAgents(agents) {
  localStorage.setItem(REGISTERED_AGENTS_KEY, JSON.stringify(Array.isArray(agents) ? agents : []));
}

async function deleteRegisteredAgent(agentId) {
  const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
  const payload = await parseApiJson(response);
  if (!response.ok) {
    throw new Error(payload.error || "Agent delete failed.");
  }

  const deleted = payload.agent || {};
  const nextAgents = loadRegisteredAgents().filter((agent) => !(
    sameName(agent.id, deleted.id || agentId) ||
    sameName(agent.agent_id, deleted.agent_id || agentId) ||
    sameName(agent.agent_name, deleted.agent_name || agentId) ||
    sameName(agent.name, agentId)
  ));
  saveRegisteredAgents(nextAgents);
  return payload;
}

function dedupeReports(reports) {
  const seen = new Set();
  return reports.filter((report) => {
    if (!report?.id || seen.has(report.id)) {
      return false;
    }
    seen.add(report.id);
    return true;
  });
}

function downloadHref(world) {
  const blob = new Blob([JSON.stringify(normalizeWorld(world), null, 2)], { type: "application/json" });
  return URL.createObjectURL(blob);
}

function entityKey(entity) {
  return `${String(entity.type || "Unknown").toLowerCase()}::${String(entity.name || "").toLowerCase()}`;
}

function relationshipKey(relationship) {
  return [relationship.source, relationship.relation, relationship.target]
    .map((part) => String(part || "").toLowerCase())
    .join("::");
}

function canonicalKey(type, name) {
  return `${slug(type || "Object")}:${slug(name || "unknown")}`;
}

function canonicalId(type, name) {
  const key = canonicalKey(type, name);
  const readable = key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return `obj_${readable}_${shortHash(key)}`;
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9./_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function sameName(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function pad(value) {
  return String(value).padStart(3, "0");
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "No timestamp";
  }

  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastUpdate(events) {
  const lastEvent = events[events.length - 1];
  return lastEvent?.timestamp ? formatTimestamp(lastEvent.timestamp) : "None";
}

function relativeTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(elapsed)) {
    return "";
  }
  const minutes = Math.max(0, Math.round(elapsed / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function copyText(value) {
  if (globalThis.navigator?.clipboard?.writeText) {
    globalThis.navigator.clipboard.writeText(value);
  }
}

export default App;
