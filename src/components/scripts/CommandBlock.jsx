import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trash2, GripVertical, ChevronUp, ChevronDown, Settings } from 'lucide-react';
import { COMMAND_TYPES, getActionsForType, generateCommandText } from '@/api/commandBlocks';

export default function CommandBlock({
  block,
  index,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false
}) {
  const [commandType, setCommandType] = useState(block.commandType || '');
  const [action, setAction] = useState(block.action || '');
  const [parameters, setParameters] = useState(block.parameters || {});
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCommandTypeChange = (newCommandType) => {
    setCommandType(newCommandType);
    setAction('');
    setParameters({});
    onUpdate(index, { commandType: newCommandType, action: '', parameters: {} });
  };

  const handleActionChange = (newAction) => {
    setAction(newAction);

    const actionObj = getActionsForType(commandType).find(a => a.id === newAction);
    const defaultParameters = {};
    if (actionObj && actionObj.parameters) {
      Object.entries(actionObj.parameters).forEach(([paramName, paramConfig]) => {
        if (paramConfig.default !== undefined) {
          defaultParameters[paramName] = paramConfig.default;
        }
      });
    }

    setParameters(defaultParameters);
    onUpdate(index, { commandType, action: newAction, parameters: defaultParameters });
  };

  const handleParameterChange = (paramName, value) => {
    const newParameters = { ...parameters, [paramName]: value };
    setParameters(newParameters);
    onUpdate(index, { commandType, action, parameters: newParameters });
  };

  const getCurrentAction = () => {
    if (!commandType || !action) return null;
    const commandTypeObj = COMMAND_TYPES[commandType.toUpperCase()];
    return commandTypeObj?.actions[action.toUpperCase()] || null;
  };

  const getCommandTypeInfo = () => {
    return COMMAND_TYPES[commandType.toUpperCase()] || null;
  };

  const renderParameterInput = (paramName, paramConfig) => {
    const value = parameters[paramName] || paramConfig.default || '';

    switch (paramConfig.type) {
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => handleParameterChange(paramName, parseFloat(e.target.value) || 0)}
            placeholder={paramConfig.placeholder || paramConfig.label}
            min={paramConfig.min}
            max={paramConfig.max}
            step={paramConfig.step || 0.1}
            className="h-9"
          />
        );
      case 'select':
        return (
          <Select value={value} onValueChange={(val) => handleParameterChange(paramName, val)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={paramConfig.label} />
            </SelectTrigger>
            <SelectContent>
              {paramConfig.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'text':
        if (paramConfig.multiline) {
          return (
            <Textarea
              value={value}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
              placeholder={paramConfig.placeholder || paramConfig.label}
              rows={2}
              className="resize-none"
            />
          );
        }
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => handleParameterChange(paramName, e.target.value)}
            placeholder={paramConfig.placeholder || paramConfig.label}
            className="h-9"
          />
        );
      default:
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => handleParameterChange(paramName, e.target.value)}
            placeholder={paramConfig.placeholder || paramConfig.label}
            className="h-9"
          />
        );
    }
  };

  const currentAction = getCurrentAction();
  const commandTypeInfo = getCommandTypeInfo();
  const commandText = commandType && action ? generateCommandText(commandType, action, parameters) : '';
  const hasParameters = currentAction && currentAction.parameters && Object.keys(currentAction.parameters).length > 0;

  return (
    <Card className="group border-l-4 border-l-orange-500/30 hover:border-l-orange-500/50 transition-all duration-200 hover:shadow-sm border border-stone-800/50 bg-stone-900/50 backdrop-blur-xl">
      <CardContent className="p-0">
        {/* Compact Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-800/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-stone-400">
              <GripVertical className="w-4 h-4" />
              <span className="text-sm font-medium">Step {index + 1}</span>
            </div>

            {commandTypeInfo && (
              <div className="flex items-center gap-2">
                <span className="text-lg">{commandTypeInfo.icon}</span>
                <Badge variant="secondary" className="text-xs bg-stone-700/50 text-stone-300 border-stone-600">
                  {commandTypeInfo.name}
                </Badge>
              </div>
            )}

            {currentAction && (
              <Badge variant="outline" className="text-xs bg-stone-800/50 text-stone-300 border-stone-600">
                {currentAction.name}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {hasParameters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 p-0"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMoveUp(index)}
              disabled={isFirst}
              className="h-8 w-8 p-0"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMoveDown(index)}
              disabled={isLast}
              className="h-8 w-8 p-0"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(index)}
              className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-4 space-y-4">
          {/* Command Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-white">Command Type</Label>
              <Select value={commandType} onValueChange={handleCommandTypeChange}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose command type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(COMMAND_TYPES).map((cmdType) => (
                    <SelectItem key={cmdType.id} value={cmdType.id}>
                      <div className="flex items-center gap-2">
                        <span>{cmdType.icon}</span>
                        <span>{cmdType.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {commandType && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-white">Action</Label>
                <Select value={action} onValueChange={handleActionChange}>
                  <SelectTrigger className="h-10 text-left">
                    <SelectValue placeholder="Choose action" />
                  </SelectTrigger>
                  <SelectContent>
                    {getActionsForType(commandType).map((actionItem) => (
                      <SelectItem key={actionItem.id} value={actionItem.id}>
                        <div>
                          <div className="font-medium">{actionItem.name}</div>
                          <div className="text-xs text-stone-400">{actionItem.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Command Preview */}
          {commandText && (
            <div className="p-3 bg-stone-800/50 rounded-lg border border-stone-700/50">
              <div className="text-xs font-medium text-stone-400 mb-1">Command Preview:</div>
              <div className="text-sm font-mono text-stone-200">{commandText}</div>
            </div>
          )}

          {/* Parameters (Expandable) */}
          {hasParameters && isExpanded && (
            <div className="space-y-4 pt-2 border-t border-stone-800/50">
              <div className="text-sm font-medium text-stone-400">Parameters</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(currentAction.parameters).map(([paramName, paramConfig]) => (
                  <div key={paramName} className="space-y-2">
                    <Label htmlFor={paramName} className="text-sm text-white">
                      {paramConfig.label}
                      {paramConfig.required && <span className="text-red-400 ml-1">*</span>}
                    </Label>
                    {renderParameterInput(paramName, paramConfig)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
